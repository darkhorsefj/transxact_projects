import { AdminUserDetail } from "./adminUserDetail";

export default function AdminUserDetailPage({ params }: { params: { id: string } }) {
  return <AdminUserDetail userId={parseInt(params.id)} />;
}
