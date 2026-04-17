import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class BroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  message!: string;
}
