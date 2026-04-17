import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  msnv!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;
}
