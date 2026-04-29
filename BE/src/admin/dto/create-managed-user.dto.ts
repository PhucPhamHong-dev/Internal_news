import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  msnv!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  initialPassword?: string;

  @IsOptional()
  @IsBoolean()
  canPost?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageEmployees?: boolean;
}
