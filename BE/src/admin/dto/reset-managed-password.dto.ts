import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class ResetManagedPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(120)
  newPassword!: string;
}
