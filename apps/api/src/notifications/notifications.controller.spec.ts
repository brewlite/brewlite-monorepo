import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard, OriginGuard, type AuthRequest } from '../auth/auth.guards';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockNotification = {
    id: 'notif-1',
    userId: 'user-1',
    title: 'Thanh toán thành công',
    content: 'Đơn hàng của bạn đã thanh toán thành công',
    isRead: false,
    createdAt: new Date(),
    orderId: 'order-1',
  };

  const mockNotificationsService = {
    findAllForUser: jest.fn().mockResolvedValue([mockNotification]),
    markAsRead: jest.fn().mockResolvedValue({ id: 'notif-1', isRead: true }),
  };

  const mockAuthRequest = {
    principal: {
      user: {
        id: 'user-1',
        email: 'test@brewlite.vn',
        role: 'CUSTOMER',
      },
    },
  } as unknown as AuthRequest;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    })
      .overrideGuard(OriginGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
  });

  it('nên được khởi tạo', () => {
    expect(controller).toBeDefined();
  });

  it('lấy danh sách thông báo của user', async () => {
    const result = await controller.getNotifications(mockAuthRequest);
    expect(result).toHaveLength(1);
    expect(mockNotificationsService.findAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('đánh dấu thông báo đã đọc', async () => {
    const result = await controller.markAsRead(mockAuthRequest, 'notif-1');
    expect(result).toEqual({ id: 'notif-1', isRead: true });
    expect(mockNotificationsService.markAsRead).toHaveBeenCalledWith('notif-1', 'user-1');
  });
});
