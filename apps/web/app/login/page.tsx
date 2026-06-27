import { AuthForm } from "../../components/auth-form";

export default function LoginPage() {
  return <AuthForm endpoint="/auth/login" title="登录" successMessage="登录成功" />;
}
