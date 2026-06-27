import { AuthForm } from "../../../components/auth-form";

export default function AdminLoginPage() {
  return <AuthForm endpoint="/admin/auth/login" title="管理员登录" successMessage="管理员登录成功" />;
}
