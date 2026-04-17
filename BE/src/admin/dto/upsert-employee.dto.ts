import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class UpsertEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  msnv!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;
}
