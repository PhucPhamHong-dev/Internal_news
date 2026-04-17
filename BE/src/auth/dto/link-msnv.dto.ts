import { IsNotEmpty, IsString, Length } from "class-validator";

export class LinkMsnvDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 50)
  msnv!: string;
}
