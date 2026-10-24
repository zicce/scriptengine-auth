import AdminPanel from "../../components/AdminPanel";
import ResellerLoginView from "../../components/ResellerLoginView";

export const metadata = {
  title: "Reseller panel demo · Script Engine",
  robots: { index: false, follow: false },
};

export default async function ResellerDemoPage({ params }) {
  const { section } = await params;
  if (!section?.length) return <ResellerLoginView demo />;
  return <AdminPanel mode="reseller" demo />;
}
