import { IsString, IsNotEmpty, MaxLength, IsOptional, IsBoolean } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AnalyzeRequestDto {
  @ApiProperty({
    description: "The video page URL to analyze for downloadable formats.",
    example: "https://example.com/watch?v=abc123",
    maxLength: 2048,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url!: string;

  @ApiPropertyOptional({
    description: "Set to true when user has confirmed age verification consent for restricted content.",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  ageConsent?: boolean;
}
