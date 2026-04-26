import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PartsService } from './parts.service';
import { CreatePartsDto, UpdatePartsDto } from './dto/create-parts.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

interface AuthenticatedRequest {
  user?: {
    id?: number;
  };
}

@Controller('parts')
@UseGuards(JwtAuthGuard)
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Post()
  create(@Body() createPartsDto: CreatePartsDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? 1;
    return this.partsService.create(createPartsDto, userId);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('brandType') brandType?: string,
  ) {
    return this.partsService.findAll(search, brandType);
  }

  @Get('search')
  search(
    @Query('q') query: string,
    @Query('brandType') brandType?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.partsService.searchParts(query, brandType, brandId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.partsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updatePartsDto: UpdatePartsDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? 1;
    return this.partsService.update(+id, updatePartsDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id ?? 1;
    return this.partsService.remove(+id, userId);
  }
}