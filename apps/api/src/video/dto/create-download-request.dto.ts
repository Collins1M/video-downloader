import { IsString, IsNotEmpty, MaxLength, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateDownloadRequestDto {
  @ApiProperty({
    description: "The video page URL to download.",
    example: "https://example.com/watch?v=abc123",
    maxLength: 2048,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;


  @ApiProperty({
    description: "The id of one of the formats returned by POST /video/analyze.",
    example: "1080p-mp4",
    maxLength: 128,
    pattern: "^[a-zA-Z0-9_-]+$",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "formatId may only contain letters, numbers, - and _",
  })
  formatId!: string;
}
