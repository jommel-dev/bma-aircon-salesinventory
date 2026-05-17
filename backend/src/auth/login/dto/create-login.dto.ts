import { IsString, IsNotEmpty } from 'class-validator';

export class CreateLoginDto {
	@IsString()
	@IsNotEmpty()
	username: string;

	@IsString()
	@IsNotEmpty()
	password: string;
}
