import ResellerLoginView, { LOGIN_ERRORS } from "./components/ResellerLoginView";

export default async function HomePage({ searchParams }) {
  const params = await searchParams;
  const message = LOGIN_ERRORS[params?.error] || "";

  return <ResellerLoginView message={message} />;
}
