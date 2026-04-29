import { ArrayMaxSize, IsArray, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { MediaTypeEnum } from "../../common/enums";

class MediaInputDto {
  @IsEnum(MediaTypeEnum)
  type!: MediaTypeEnum;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsString()
  @IsNotEmpty()
  publicId!: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  thumbnailPublicId?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsString()
  clientBlockId?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  sizeBytes?: number;
}

class PostContentBlockDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  type!: "paragraph" | "heading" | "quote" | "divider" | "image" | "video";

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @IsOptional()
  @IsString()
  publicId?: string;

  @IsOptional()
  @IsString()
  thumbnailPublicId?: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MediaInputDto)
  media?: MediaInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => PostContentBlockDto)
  blocks?: PostContentBlockDto[];
}
