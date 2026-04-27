import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class EmployeeLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  msnv!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(120)
  password!: string;
}
