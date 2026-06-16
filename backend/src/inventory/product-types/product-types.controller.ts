import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProductTypesService } from './product-types.service';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { UpdateProductTypeDto } from './dto/update-product-type.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('product-types')
@UseGuards(JwtAuthGuard)
export class ProductTypesController {
  constructor(private readonly productTypesService: ProductTypesService) {}

  @Post()
  create(@Body() createProductTypeDto: CreateProductTypeDto) {
    return this.productTypesService.create(createProductTypeDto);
  }

  @Get()
  findAll() {
    return this.productTypesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productTypesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateProductTypeDto: UpdateProductTypeDto) {
    return this.productTypesService.update(+id, updateProductTypeDto);
  }

  @Post(':id/resequence')
  resequence(@Param('id') id: string) {
    return this.productTypesService.resequenceByProductTypeId(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productTypesService.remove(+id);
  }
}
