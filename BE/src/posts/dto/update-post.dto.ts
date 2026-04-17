import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpdatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;
}
