import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { DoctorsService } from './doctors.service.js';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Verified doctors visible to everyone' })
  @ApiQuery({ name: 'q', required: false, description: 'Search name or specialization' })
  @ApiQuery({ name: 'specialization', required: false })
  list(@Query('q') q?: string, @Query('specialization') specialization?: string) {
    return this.doctors.listPublic({
      q: q?.trim() || undefined,
      specialization: specialization?.trim() || undefined,
    });
  }

  @Public()
  @Get('specializations')
  @ApiOperation({ summary: 'Distinct specializations of verified doctors' })
  specializations() {
    return this.doctors.specializations();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public profile of one verified doctor' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.doctors.getPublic(id);
  }
}
