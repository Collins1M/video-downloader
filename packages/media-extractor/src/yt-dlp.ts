import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  UnsupportedSourceError,
  VideoUnavailableError,
  ExtractionTimeoutError,
  ExtractionFailedError,
  AuthenticationRequiredError,
  AgeConsentRequiredError,
} from "./errors";

export interface RunYtDlpOptions {
  timeoutMs: number;
  maxBufferBytes?: number;
  cookiesPath?: string;
  ageConsent?: boolean;
}


/**
 * Core arguments to bypass bot detection and 403 Forbidden errors.
 * --impersonate chrome: mimics a real browser's TLS fingerprint and headers.
 * NOTE: Requires `curl-cffi` to be installed in the Python environment.
 */
const STEALTH_ARGS = [
  "--impersonate",
  "chrome",
  "--user-agent",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "--add-header",
  "Accept-Language: en-US,en;q=0.9",
  "--add-header",
  "Sec-Fetch-Mode: navigate",
  "--add-header",
  "Sec-Fetch-Site: cross-site",
  "--add-header",
  "Sec-Fetch-Dest: document",
  "--no-check-certificates",
];

export function sanitizeUrl(inputUrl: string): string {
  const match = /https?:\/\/[^\s]+/i.exec(inputUrl.trim());
  return match ? match[0] : inputUrl.trim();
}

export async function runYtDlp(args: string[], options: RunYtDlpOptions): Promise<string> {
  const rawUrl = args[args.length - 1];
  const url = sanitizeUrl(rawUrl);
  args[args.length - 1] = url;
  const finalArgs = [...STEALTH_ARGS];

  if (options.ageConsent) {
    finalArgs.push("--age-limit", "99");
  }

  // Instagram Web API stealth headers
  if (url && (url.includes("instagram.com") || url.includes("instagr.am"))) {
    finalArgs.push("--add-header", "X-IG-App-ID: 936619743392459");
    finalArgs.push("--add-header", "X-ASBD-ID: 198387");
    finalArgs.push("--add-header", "X-IG-WWW-Claim: 0");
  }

  if (url && url.includes("pornhub")) {
    finalArgs.push("--add-header", "Cookie: age_verified=1; accessType=1; hasVisited=1");
  }

  finalArgs.push(...args);

  // Use the URL (usually the last arg) as the referer to bypass some 403 blocks
  if (url?.startsWith("http")) {
    finalArgs.unshift("--referer", url);
  }

  const tempCookiesPath = await ensureCookieFile(url, options.cookiesPath, options.ageConsent);
  if (tempCookiesPath) {
    finalArgs.unshift("--cookies", tempCookiesPath);
  }

  const startTime = Date.now();
  console.log(`[YtDlp] Executing: yt-dlp ${finalArgs.join(" ")}`);

  try {
    const stdout = await new Promise<string>((resolvePromise, reject) => {
      execFile(
        "yt-dlp",
        finalArgs,
        {
          timeout: options.timeoutMs,
          maxBuffer: options.maxBufferBytes ?? 20 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const duration = Date.now() - startTime;
          console.log(`[YtDlp] Finished in ${duration}ms`);

          if (!error) {
            resolvePromise(stdout);
            return;
          }

          console.error(`[YtDlp] Command failed after ${duration}ms:`, stderr);

          if ((error as { killed?: boolean }).killed || error.signal === "SIGTERM") {
            reject(new ExtractionTimeoutError(stderr));
            return;
          }

          const lowerStderr = stderr.toLowerCase();
          if (lowerStderr.includes("unsupported url")) {
            reject(new UnsupportedSourceError(stderr));
            return;
          }

          // If ageConsent was NOT passed yet, signal to prompt for age consent first
          if (!options.ageConsent) {
            if (
              lowerStderr.includes("sign in to confirm your age") ||
              lowerStderr.includes("confirm your age") ||
              lowerStderr.includes("age-restricted") ||
              lowerStderr.includes("can't be seen by certain audiences") ||
              lowerStderr.includes("isn't available to everyone") ||
              lowerStderr.includes("redirection detected") ||
              lowerStderr.includes("require login")
            ) {
              reject(new AgeConsentRequiredError(stderr));
              return;
            }
          }

          // If ageConsent WAS passed and content is still restricted to logged-in/private audiences,
          // then Instagram/platform strictly requires a logged-in account.
          if (
            lowerStderr.includes("you need to log in") ||
            lowerStderr.includes("use --cookies") ||
            lowerStderr.includes("isn't available to everyone") ||
            lowerStderr.includes("can't be seen by certain audiences") ||
            lowerStderr.includes("redirection detected")
          ) {
            reject(new AuthenticationRequiredError(stderr));
            return;
          }

          if (
            lowerStderr.includes("video unavailable") ||
            lowerStderr.includes("private video") ||
            lowerStderr.includes("this video is unavailable") ||
            lowerStderr.includes("content isn't available") ||
            lowerStderr.includes("model is in a private show") ||
            lowerStderr.includes("room is currently offline") ||
            lowerStderr.includes("no video could be found in this tweet")
          ) {
            reject(new VideoUnavailableError(stderr));
            return;
          }

          reject(new ExtractionFailedError(stderr));
        },
      );
    });
    return stdout;
  } finally {
    if (tempCookiesPath) {
      await fs.unlink(tempCookiesPath).catch((err) => {
        console.warn(`[YtDlp] Failed to delete temp cookies file ${tempCookiesPath}: ${err}`);
      });
    }
  }
}

async function ensureCookieFile(url: string, userCookiesPath?: string, ageConsent?: boolean): Promise<string | undefined> {
  const isPornhub = url && url.includes("pornhub");
  if (!isPornhub && !userCookiesPath && !ageConsent) return undefined;

  let content = "# Netscape HTTP Cookie File\n";

  if (userCookiesPath) {
    try {
      const userContent = await fs.readFile(userCookiesPath, "utf-8");
      content += userContent.replace("# Netscape HTTP Cookie File\n", "") + "\n";
    } catch (err) {
      console.warn(`[YtDlp] Failed to read user cookies at ${userCookiesPath}: ${err}`);
    }
  }

  if (isPornhub || ageConsent) {
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\tage_verified\t1\n";
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\taccessType\t1\n";
    content += ".pornhub.com\tTRUE\t/\tFALSE\t2147483647\thasVisited\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\tage_verified\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\taccessType\t1\n";
    content += ".pornhub.org\tTRUE\t/\tFALSE\t2147483647\thasVisited\t1\n";
    content += ".youtube.com\tTRUE\t/\tFALSE\t2147483647\tST-1393685324\t1\n";
  }

  const tempPath = path.join(os.tmpdir(), `ytdlp-cookies-${crypto.randomBytes(8).toString("hex")}.txt`);
  await fs.writeFile(tempPath, content);
  return tempPath;
}

export async function fetchYtDlpInfo(
  url: string,
  timeoutMs: number,
  cookiesPath?: string,
  allowPlaylist: boolean = true,
  ageConsent: boolean = false,
): Promise<YtDlpInfo> {
  const args = ["--dump-single-json", "--no-warnings", "--no-check-certificates"];
  if (!allowPlaylist) {
    args.push("--no-playlist");
  }

  args.push("--", url);

  try {
    const stdout = await runYtDlp(args, { timeoutMs, cookiesPath, ageConsent });
    let info: YtDlpInfo;
    try {
      info = JSON.parse(stdout) as YtDlpInfo;
    } catch (err) {
      throw new ExtractionFailedError("yt-dlp returned non-JSON output");
    }
    console.log(`[YtDlp] Successfully parsed JSON for ${info.id || info.title}. Type: ${info._type ?? 'single'}`);
    return info;
  } catch (err) {
    // Instagram image post extraction fallback
    const instagramMatch = /instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i.exec(url);
    if (instagramMatch) {
      console.log(`[YtDlp] Attempting Instagram image post extraction for ${url}...`);
      const imgInfo = await fetchInstagramImagePost(url);
      if (imgInfo) {
        console.log(`[YtDlp] Instagram image extraction successful for ${imgInfo.id}`);
        return imgInfo;
      }
    }

    // Twitter / X image post extraction fallback
    const twitterMatch = /(?:twitter\.com|x\.com)\/[^/]+\/status\/(\d+)/i.exec(url);
    if (twitterMatch) {
      console.log(`[YtDlp] Attempting Twitter/X image post extraction for ${url}...`);
      const twImgInfo = await fetchTwitterImagePost(url);
      if (twImgInfo) {
        console.log(`[YtDlp] Twitter image extraction successful for ${twImgInfo.id}`);
        return twImgInfo;
      }
    }
    throw err;
  }
}

export async function fetchInstagramGraphQLMedia(shortcode: string): Promise<YtDlpInfo | null> {
  const postUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "198387",
    "X-IG-WWW-Claim": "0",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };

  try {
    const res = await fetch(postUrl, { headers });
    if (!res.ok) return null;

    const data = (await res.json()) as any;
    const media = data?.graphql?.shortcode_media || data?.items?.[0];
    if (!media) return null;

    const title =
      media.title ||
      media.caption?.text ||
      media.edge_media_to_caption?.edges?.[0]?.node?.text ||
      "Instagram Post";
    const duration = media.video_duration || 0;

    const sidecarEdges = media.edge_sidecar_to_children?.edges || media.carousel_media;
    if (sidecarEdges && Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
      const entries: YtDlpInfo[] = sidecarEdges.map((edge: any, index: number) => {
        const node = edge.node || edge;
        const isVideo = Boolean(node.is_video);
        const itemMediaUrl = isVideo
          ? node.video_url || node.video_versions?.[0]?.url
          : node.display_url || node.image_versions2?.candidates?.[0]?.url;
        const itemThumb =
          node.display_url || node.image_versions2?.candidates?.[0]?.url || itemMediaUrl;

        return {
          id: `${shortcode}-${index + 1}`,
          title: `${title} (Slide ${index + 1}/${sidecarEdges.length})`,
          thumbnail: itemThumb,
          duration: node.video_duration || 0,
          webpage_url: `https://www.instagram.com/p/${shortcode}/`,
          url: itemMediaUrl,
          extractor_key: "Instagram",
          extractor: "instagram",
          formats: isVideo
            ? [
                {
                  format_id: `video-${index + 1}`,
                  ext: "mp4",
                  height: node.dimensions?.height || 1080,
                  vcodec: "h264",
                  acodec: "aac",
                  protocol: "https",
                },
              ]
            : [
                {
                  format_id: `image-${index + 1}`,
                  ext: "jpg",
                  height: node.dimensions?.height || 1080,
                  vcodec: "none",
                  acodec: "none",
                  protocol: "https",
                },
              ],
        };
      });

      return {
        id: shortcode,
        title,
        thumbnail: entries[0].thumbnail,
        duration: 0,
        webpage_url: `https://www.instagram.com/p/${shortcode}/`,
        url: entries[0].url,
        extractor_key: "Instagram",
        extractor: "instagram",
        _type: "playlist",
        entries,
        formats: entries[0].formats,
      };
    }

    const isVideo = Boolean(media.is_video);
    const mediaUrl = isVideo
      ? media.video_url || media.video_versions?.[0]?.url
      : media.display_url || media.image_versions2?.candidates?.[0]?.url;
    const thumbUrl =
      media.display_url || media.image_versions2?.candidates?.[0]?.url || mediaUrl;

    return {
      id: shortcode,
      title,
      thumbnail: thumbUrl,
      duration,
      webpage_url: `https://www.instagram.com/p/${shortcode}/`,
      url: mediaUrl,
      extractor_key: "Instagram",
      extractor: "instagram",
      formats: isVideo
        ? [
            {
              format_id: "best-mp4",
              ext: "mp4",
              height: media.dimensions?.height || 1080,
              vcodec: "h264",
              acodec: "aac",
              protocol: "https",
            },
          ]
        : [
            {
              format_id: "image",
              ext: "jpg",
              height: media.dimensions?.height || 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
    };
  } catch (err) {
    console.warn(`[InstagramGraphQL] Web API fetch failed for ${shortcode}: ${err}`);
    return null;
  }
}

export async function fetchInstagramEmbedMedia(shortcode: string): Promise<YtDlpInfo | null> {
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    let mediaObj: any = null;

    const jsonMatch =
      html.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*(\{.*?\})\s*\)\s*;/s) ||
      html.match(/["']shortcode_media["']\s*:\s*(\{.*?\})\s*,\s*["']/s) ||
      html.match(/["']items["']\s*:\s*(\[\s*\{.*?\}\s*\])/s);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        mediaObj =
          parsed?.graphql?.shortcode_media ||
          parsed?.shortcode_media ||
          (Array.isArray(parsed) ? parsed[0] : parsed);
      } catch {
        // ignore parse error
      }
    }

    const sidecarEdges = mediaObj?.edge_sidecar_to_children?.edges || mediaObj?.carousel_media;

    if (sidecarEdges && Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
      const title = mediaObj?.caption?.text || mediaObj?.title || "Instagram Post";
      const entries: YtDlpInfo[] = sidecarEdges.map((edge: any, index: number) => {
        const node = edge.node || edge;
        const isVideo = Boolean(node.is_video);
        const itemMediaUrl = isVideo
          ? node.video_url || node.video_versions?.[0]?.url
          : node.display_url || node.image_versions2?.candidates?.[0]?.url;
        const itemThumb =
          node.display_url || node.image_versions2?.candidates?.[0]?.url || itemMediaUrl;

        return {
          id: `${shortcode}-${index + 1}`,
          title: `${title} (Slide ${index + 1}/${sidecarEdges.length})`,
          thumbnail: itemThumb,
          duration: node.video_duration || 0,
          webpage_url: `https://www.instagram.com/p/${shortcode}/`,
          url: itemMediaUrl,
          extractor_key: "Instagram",
          extractor: "instagram",
          formats: isVideo
            ? [
                {
                  format_id: `video-${index + 1}`,
                  ext: "mp4",
                  height: node.dimensions?.height || 1080,
                  vcodec: "h264",
                  acodec: "aac",
                  protocol: "https",
                },
              ]
            : [
                {
                  format_id: `image-${index + 1}`,
                  ext: "jpg",
                  height: node.dimensions?.height || 1080,
                  vcodec: "none",
                  acodec: "none",
                  protocol: "https",
                },
              ],
        };
      });

      return {
        id: shortcode,
        title,
        thumbnail: entries[0].thumbnail,
        duration: 0,
        webpage_url: `https://www.instagram.com/p/${shortcode}/`,
        url: entries[0].url,
        extractor_key: "Instagram",
        extractor: "instagram",
        _type: "playlist",
        entries,
        formats: entries[0].formats,
      };
    }

    if (mediaObj) {
      const isVideo = Boolean(mediaObj.is_video);
      const mediaUrl = isVideo
        ? mediaObj.video_url || mediaObj.video_versions?.[0]?.url
        : mediaObj.display_url || mediaObj.image_versions2?.candidates?.[0]?.url;
      const thumbUrl =
        mediaObj.display_url || mediaObj.image_versions2?.candidates?.[0]?.url || mediaUrl;
      const title = mediaObj.caption?.text || mediaObj.title || "Instagram Post";

      if (mediaUrl) {
        return {
          id: shortcode,
          title,
          thumbnail: thumbUrl,
          duration: mediaObj.video_duration || 0,
          webpage_url: `https://www.instagram.com/p/${shortcode}/`,
          url: mediaUrl,
          extractor_key: "Instagram",
          extractor: "instagram",
          formats: isVideo
            ? [
                {
                  format_id: "best-mp4",
                  ext: "mp4",
                  height: mediaObj.dimensions?.height || 1080,
                  vcodec: "h264",
                  acodec: "aac",
                  protocol: "https",
                },
              ]
            : [
                {
                  format_id: "image",
                  ext: "jpg",
                  height: mediaObj.dimensions?.height || 1080,
                  vcodec: "none",
                  acodec: "none",
                  protocol: "https",
                },
              ],
        };
      }
    }

    const embedImageUrls: string[] = [];
    const imgMatches = [...html.matchAll(/<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"/gi)];
    for (const m of imgMatches) {
      const img = m[1].replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
      if (img && !embedImageUrls.includes(img)) {
        embedImageUrls.push(img);
      }
    }

    if (embedImageUrls.length === 0) {
      const allImgMatches = [
        ...html.matchAll(
          /(https:\/\/[^"'\s\\]+?cdninstagram\.com\/v\/[^"'\s\\]+?\.(?:jpg|jpeg|png|webp)[^"'\s\\]*)/gi,
        ),
      ];
      for (const m of allImgMatches) {
        const clean = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "").replace(/&amp;/g, "&");
        if (
          clean &&
          !clean.includes("150x150") &&
          !clean.includes("profile_pic") &&
          !embedImageUrls.includes(clean)
        ) {
          embedImageUrls.push(clean);
        }
      }
    }

    if (embedImageUrls.length > 0) {
      const isVideo = html.includes("EmbeddedMediaVideo") || html.includes("video_url");
      const videoMatch = html.match(
        /src="(https:\/\/[^"]+?cdninstagram\.com\/v\/[^"]+?\.mp4[^"]*)"/i,
      );
      const mediaUrl =
        isVideo && videoMatch ? videoMatch[1].replace(/&amp;/g, "&") : embedImageUrls[0];

      return {
        id: shortcode,
        title: "Instagram Post",
        thumbnail: embedImageUrls[0],
        duration: 0,
        webpage_url: `https://www.instagram.com/p/${shortcode}/`,
        url: mediaUrl,
        extractor_key: "Instagram",
        extractor: "instagram",
        formats: isVideo
          ? [
              {
                format_id: "best-mp4",
                ext: "mp4",
                height: 1080,
                vcodec: "h264",
                acodec: "aac",
                protocol: "https",
              },
            ]
          : [
              {
                format_id: "image",
                ext: "jpg",
                height: 1080,
                vcodec: "none",
                acodec: "none",
                protocol: "https",
              },
            ],
      };
    }

    return null;
  } catch (err) {
    console.warn(`[InstagramEmbed] Failed for ${shortcode}: ${err}`);
    return null;
  }
}

function getFullSizeInstagramImageUrl(url: string): string {
  if (!url) return "";
  return url.replace(/\\u0026/g, "&").replace(/\\/g, "").replace(/&amp;/g, "&");
}

export async function fetchInstagramImagePost(url: string): Promise<YtDlpInfo | null> {
  const match = /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i.exec(url);
  if (!match) return null;

  const shortcode = match[1];

  const gqlInfo = await fetchInstagramGraphQLMedia(shortcode);
  if (gqlInfo) {
    console.log(`[InstagramGraphQL] Successfully resolved media for ${shortcode}`);
    return gqlInfo;
  }

  const embedInfo = await fetchInstagramEmbedMedia(shortcode);
  if (embedInfo) {
    console.log(`[InstagramEmbed] Successfully resolved media for ${shortcode}`);
    return embedInfo;
  }

  const postUrl = `https://www.instagram.com/p/${shortcode}/`;

  const userAgents = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(postUrl, {
        headers: {
          "User-Agent": ua,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) continue;

      const html = await res.text();

      const imageUrls: string[] = [];
      const uniqueBaseUrls = new Set<string>();

      const allImageMatches = [...html.matchAll(/(https:\/\/[^"'\s\\]+?cdninstagram\.com\/v\/[^"'\s\\]+?\.(?:jpg|jpeg|png|webp)[^"'\s\\]*)/gi)];
      for (const m of allImageMatches) {
        let clean = m[1].replace(/\\u0026/g, "&").replace(/\\/g, "").replace(/&amp;/g, "&");

        if (clean.includes("t51.2885-19") || clean.includes("t51.82787-19") || clean.includes("rsrc.php")) continue;
        if (clean.includes("p150x150") || clean.includes("p240x240") || clean.includes("p320x320") || clean.includes("p480x480") || clean.includes("p640x640") || clean.includes("p720x720")) continue;

        const baseMatch = /(https:\/\/[^?]+?\.(?:jpg|jpeg|png|webp))/i.exec(clean);
        if (baseMatch) {
          const imgUrl = baseMatch[1];
          if (imgUrl.includes("_n.jpg") || imgUrl.includes("_n.png") || imgUrl.includes("_n.webp") || imgUrl.includes("t51.82787-15") || imgUrl.includes("t39.30808-6")) {
            if (!uniqueBaseUrls.has(imgUrl)) {
              uniqueBaseUrls.add(imgUrl);
              imageUrls.push(clean);
            }
          }
        }
      }

      if (imageUrls.length === 0) {
        const ogImgMatch =
          html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i) ||
          html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i);
        if (ogImgMatch) {
          imageUrls.push(ogImgMatch[1].replace(/&amp;/g, "&"));
        }
      }

      // Also parse Instagram JSON data (window.__additionalDataLoaded or script tags) for carousel children
      try {
        const jsonMatches = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi)];
        for (const jm of jsonMatches) {
          const content = jm[1];
          if (content.includes("edge_sidecar_to_children") || content.includes("display_url")) {
            const displayUrlMatches = [...content.matchAll(/"display_url"\s*:\s*"([^"]+)"/g)];
            for (const dum of displayUrlMatches) {
              const url = dum[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
              const baseMatch = /(https:\/\/[^?]+?\.(?:jpg|jpeg|png|webp))/i.exec(url);
              if (baseMatch && !uniqueBaseUrls.has(baseMatch[1])) {
                uniqueBaseUrls.add(baseMatch[1]);
                imageUrls.push(url);
              }
            }
          }
        }
      } catch (jsonErr) {
        // ignore JSON parse errors
      }

      if (imageUrls.length === 0) continue;

      const fullSizeImageUrls = imageUrls.map(getFullSizeInstagramImageUrl);

      let title = "Instagram Photo";
      const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
      if (ogTitleMatch) {
        title = decodeHtmlEntities(ogTitleMatch[1]);
      }

      console.log(`[InstagramImageExtractor] Extracted ${fullSizeImageUrls.length} unique carousel image(s) for ${shortcode}`);

      if (fullSizeImageUrls.length > 1) {
        const entries: YtDlpInfo[] = fullSizeImageUrls.map((imgUrl, index) => ({
          id: `${shortcode}-${index + 1}`,
          title: `${title} (Slide ${index + 1}/${fullSizeImageUrls.length})`,
          thumbnail: imgUrl,
          duration: 0,
          webpage_url: postUrl,
          url: imgUrl,
          extractor_key: "Instagram",
          extractor: "instagram",
          formats: [
            {
              format_id: `image-${index + 1}`,
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        }));

        return {
          id: shortcode,
          title,
          thumbnail: fullSizeImageUrls[0],
          duration: 0,
          webpage_url: postUrl,
          url: fullSizeImageUrls[0],
          extractor_key: "Instagram",
          extractor: "instagram",
          _type: "playlist",
          entries,
          formats: [
            {
              format_id: "image-1",
              ext: "jpg",
              height: 1080,
              vcodec: "none",
              acodec: "none",
              protocol: "https",
            },
          ],
        };
      }

      const imageUrl = fullSizeImageUrls[0];
      return {
        id: shortcode,
        title,
        thumbnail: imageUrl,
        duration: 0,
        webpage_url: postUrl,
        url: imageUrl,
        extractor_key: "Instagram",
        extractor: "instagram",
        formats: [
          {
            format_id: "image",
            ext: "jpg",
            height: 1080,
            vcodec: "none",
            acodec: "none",
            protocol: "https",
          },
        ],
      };
    } catch (err) {
      console.warn(`[InstagramImageExtractor] Failed with UA ${ua}: ${err}`);
    }
  }

  return null;
}

function getFullSizeTwitterImageUrl(url: string): string {
  if (!url) return "";
  return url.replace(/\\u0026/g, "&").replace(/\\/g, "").replace(/&amp;/g, "&");
}

export async function fetchTwitterImagePost(url: string): Promise<YtDlpInfo | null> {
  const match = /(?:twitter\.com|x\.com)\/([^/]+)\/status\/(\d+)/i.exec(url);
  if (!match) return null;

  const username = match[1];
  const tweetId = match[2];

  // Try fxtwitter / vxtwitter API or HTML which provides public open graph image data
  const fxUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
  try {
    const res = await fetch(fxUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });

    if (res.ok) {
      const data = await res.json() as any;
      const tweet = data?.tweet;
      if (tweet) {
        const media = tweet.media?.photos || [];
        const imageUrls: string[] = media.map((p: any) => p.url).filter(Boolean);
        const title = tweet.text || `${tweet.author?.name || username} on X`;

        if (imageUrls.length > 1) {
          const entries: YtDlpInfo[] = imageUrls.map((imgUrl, index) => ({
            id: `${tweetId}-${index + 1}`,
            title: `${title} (Image ${index + 1}/${imageUrls.length})`,
            thumbnail: imgUrl,
            duration: 0,
            webpage_url: url,
            url: imgUrl,
            extractor_key: "Twitter",
            extractor: "twitter",
            formats: [
              {
                format_id: `image-${index + 1}`,
                ext: "jpg",
                height: 1080,
                vcodec: "none",
                acodec: "none",
                protocol: "https",
              },
            ],
          }));

          return {
            id: tweetId,
            title,
            thumbnail: imageUrls[0],
            duration: 0,
            webpage_url: url,
            url: imageUrls[0],
            extractor_key: "Twitter",
            extractor: "twitter",
            _type: "playlist",
            entries,
            formats: [
              {
                format_id: "image-1",
                ext: "jpg",
                height: 1080,
                vcodec: "none",
                acodec: "none",
                protocol: "https",
              },
            ],
          };
        } else if (imageUrls.length === 1) {
          return {
            id: tweetId,
            title,
            thumbnail: imageUrls[0],
            duration: 0,
            webpage_url: url,
            url: imageUrls[0],
            extractor_key: "Twitter",
            extractor: "twitter",
            formats: [
              {
                format_id: "image",
                ext: "jpg",
                height: 1080,
                vcodec: "none",
                acodec: "none",
                protocol: "https",
              },
            ],
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[TwitterImageExtractor] FXTwitter lookup failed: ${err}`);
  }

  return null;
}


export async function runYtDlpWithProgress(
  args: string[],
  options: RunYtDlpOptions,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const url = args[args.length - 1];
  const finalArgs = [...STEALTH_ARGS];

  if (options.ageConsent) {
    finalArgs.push("--age-limit", "99");
  }

  if (url && (url.includes("instagram.com") || url.includes("instagr.am"))) {
    finalArgs.push("--add-header", "X-IG-App-ID: 936619743392459");
    finalArgs.push("--add-header", "X-ASBD-ID: 198387");
    finalArgs.push("--add-header", "X-IG-WWW-Claim: 0");
  }

  finalArgs.push(...args);

  if (url?.startsWith("http")) {
    finalArgs.unshift("--referer", url);
  }

  const tempCookiesPath = await ensureCookieFile(url, options.cookiesPath, options.ageConsent);
  if (tempCookiesPath) {
    finalArgs.unshift("--cookies", tempCookiesPath);
  }

  const startTime = Date.now();
  console.log(`[YtDlp] Executing with progress: yt-dlp ${finalArgs.join(" ")}`);

  try {
    return await new Promise<string>((resolvePromise, reject) => {
      const child = spawn("yt-dlp", finalArgs, {
        timeout: options.timeoutMs,
      });

      let stdoutData = "";
      let stderrData = "";

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf-8");
        stdoutData += text;

        if (onProgress) {
          const lines = text.split(/[\r\n]+/);
          for (const line of lines) {
            const match = /\[download\]\s+([\d.]+)/i.exec(line);
            if (match) {
              const parsed = parseFloat(match[1]);
              if (!isNaN(parsed)) {
                onProgress(parsed);
              }
            }
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrData += chunk.toString("utf-8");
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new ExtractionFailedError(err.message));
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        console.log(`[YtDlp] Finished in ${duration}ms (code ${code})`);

        if (code === 0) {
          resolvePromise(stdoutData);
          return;
        }

        console.error(`[YtDlp] Command failed after ${duration}ms:`, stderrData);

        if (timedOut || signal === "SIGTERM") {
          reject(new ExtractionTimeoutError(stderrData));
          return;
        }

        const lowerStderr = stderrData.toLowerCase();
        if (lowerStderr.includes("unsupported url")) {
          reject(new UnsupportedSourceError(stderrData));
          return;
        }

        if (!options.ageConsent) {
          if (
            lowerStderr.includes("sign in to confirm your age") ||
            lowerStderr.includes("confirm your age") ||
            lowerStderr.includes("age-restricted") ||
            lowerStderr.includes("can't be seen by certain audiences") ||
            lowerStderr.includes("isn't available to everyone") ||
            lowerStderr.includes("redirection detected") ||
            lowerStderr.includes("require login")
          ) {
            reject(new AgeConsentRequiredError(stderrData));
            return;
          }
        }

        if (
          lowerStderr.includes("you need to log in") ||
          lowerStderr.includes("use --cookies") ||
          lowerStderr.includes("isn't available to everyone") ||
          lowerStderr.includes("can't be seen by certain audiences")
        ) {
          reject(new AuthenticationRequiredError(stderrData));
          return;
        }

        if (
          lowerStderr.includes("video unavailable") ||
          lowerStderr.includes("private video") ||
          lowerStderr.includes("this video is unavailable") ||
          lowerStderr.includes("content isn't available") ||
          lowerStderr.includes("redirection detected") ||
          lowerStderr.includes("model is in a private show") ||
          lowerStderr.includes("room is currently offline")
        ) {
          reject(new VideoUnavailableError(stderrData));
          return;
        }

        reject(new ExtractionFailedError(stderrData));
      });
    });
  } finally {
    if (tempCookiesPath) {
      await fs.unlink(tempCookiesPath).catch((err) => {
        console.warn(`[YtDlp] Failed to delete temp cookies file ${tempCookiesPath}: ${err}`);
      });
    }
  }
}

export async function fetchYtDlpFormat(
  url: string,
  ytDlpFormatId: string,
  outputPath: string,
  timeoutMs: number,
  cookiesPath?: string,
  ageConsent?: boolean,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const formatSpec =
    ytDlpFormatId.includes("/") || ytDlpFormatId === "best" || ytDlpFormatId === "b"
      ? ytDlpFormatId
      : `${ytDlpFormatId}/best`;

  const args = [
    "-f",
    formatSpec,
    "-o",
    outputPath,
    "--newline",
    "--no-warnings",
    "--no-playlist",
    "--no-check-certificates",
    "--no-part",
    "--retries",
    "10",
    "--fragment-retries",
    "10",
    "--concurrent-fragments",
    "5",
    "--",
    url,
  ];

  if (onProgress) {
    await runYtDlpWithProgress(args, { timeoutMs, cookiesPath, ageConsent }, onProgress);
  } else {
    args.unshift("--no-progress");
    await runYtDlp(args, { timeoutMs, cookiesPath, ageConsent });
  }
}



export interface YtDlpFormat {
  format_id: string;
  ext: string;
  height?: number | null;
  vcodec?: string;
  acodec?: string;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
  protocol?: string;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .trim();
}

export interface YtDlpInfo {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  webpage_url?: string;
  url?: string;
  extractor_key?: string;
  extractor?: string;
  uploader?: string;
  _type?: string;
  entries?: YtDlpInfo[];
  formats?: YtDlpFormat[];
  age_limit?: number;
}
