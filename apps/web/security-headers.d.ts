export interface SecurityHeader {
  key: string;
  value: string;
}

export function buildSecurityHeaders(): SecurityHeader[];
