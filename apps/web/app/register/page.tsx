import { AuthForm } from "../../components/auth-form";

export default function RegisterPage() {
  return <AuthForm endpoint="/auth/register" title="注册" successMessage="注册成功，请查看邮箱完成验证" />;
}
