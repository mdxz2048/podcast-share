import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return <AuthForm endpoint="/auth/login" title="统一登录" successMessage="登录成功" redirectByRole />;
}
