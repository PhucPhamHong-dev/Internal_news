import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ResetManagedPasswordDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  newPassword?: string;
}
