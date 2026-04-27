import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentPassword?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(120)
  newPassword!: string;
}
