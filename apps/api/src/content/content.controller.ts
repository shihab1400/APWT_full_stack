import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { ContentService } from './content.service.js';

// Public content changes rarely; let browsers and proxies reuse it briefly.
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

@ApiTags('content')
@Public()
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get('blogs')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOperation({ summary: 'Published articles, newest first' })
  @ApiQuery({ name: 'category', required: false })
  listBlogs(@Query('category') category?: string) {
    return this.content.listBlogs(category || undefined);
  }

  @Get('blogs/:slug')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOperation({ summary: 'One published article' })
  getBlog(@Param('slug') slug: string) {
    return this.content.getBlog(slug);
  }

  @Get('faqs')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOperation({ summary: 'FAQs grouped by category' })
  listFaqs() {
    return this.content.listFaqs();
  }

  @Get('hotlines')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOperation({ summary: 'Emergency and support hotlines' })
  listHotlines() {
    return this.content.listHotlines();
  }

  @Get('pricing')
  @Header('Cache-Control', PUBLIC_CACHE)
  @ApiOperation({ summary: 'Plans and the current consultation fee range' })
  getPricing() {
    return this.content.getPricing();
  }
}
