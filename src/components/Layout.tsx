import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import VisaChatBot from "@/components/VisaChatBot";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <BackButton />
      <main className="flex-1">{children}</main>
      <Footer />
      <VisaChatBot />
    </div>
  );
}
