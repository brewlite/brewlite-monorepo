import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

describe('CategoriesController', () => {
  let controller: CategoriesController;

  const mockCategories = [
    { id: 'cat-1', name: 'Cà phê', isActive: true, _count: { products: 3 } },
    { id: 'cat-2', name: 'Trà', isActive: true, _count: { products: 2 } },
  ];

  const mockCategoriesService = {
    findAll: jest.fn().mockResolvedValue(mockCategories),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
  });

  it('nên được khởi tạo', () => {
    expect(controller).toBeDefined();
  });

  it('lấy danh sách categories', async () => {
    const result = await controller.getCategories();
    expect(result).toHaveLength(2);
    expect(mockCategoriesService.findAll).toHaveBeenCalled();
  });
});
