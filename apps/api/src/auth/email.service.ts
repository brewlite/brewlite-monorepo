import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  async sendVerification(email: string, code: string) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      console.log(`\n======================================================`);
      console.log(`🔑 [DEV MODE OTP] Mã xác minh email cho ${email}: ${code}`);
      console.log(`======================================================\n`);
      return;
    }
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transport.sendMail({
        from: { name: 'BrewLite', address: user },
        to: email,
        subject: 'Xác minh email BrewLite',
        text: `Mã xác minh BrewLite: ${code}. Mã có hiệu lực 10 phút và chỉ dùng một lần. Nếu không yêu cầu, hãy bỏ qua email này.`,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Chưa gửi được email. Vui lòng thử gửi lại OTP.',
      );
    } finally {
      transport.close();
    }
  }
}
