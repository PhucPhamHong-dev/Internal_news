import { IsNotEmpty, IsString } from "class-validator";

export class GoogleCallbackDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
