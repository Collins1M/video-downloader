import { IsString, IsNotEmpty, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

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
}
