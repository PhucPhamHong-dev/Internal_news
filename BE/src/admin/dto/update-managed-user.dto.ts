import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateManagedUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  canPost?: boolean;

  @IsOptional()
  @IsBoolean()
  canManageEmployees?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  loginEmail?: string | null;
}
