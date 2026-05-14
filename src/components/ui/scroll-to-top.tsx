import { useState, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scrollContainer = document.querySelector("main.overflow-y-auto");
    if (!scrollContainer) return;

    const handleScroll = () => {
      setVisible(scrollContainer.scrollTop > 400);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollUp = () => {
    const scrollContainer = document.querySelector("main.overflow-y-auto");
    scrollContainer?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Button
      onClick={scrollUp}
      size="icon"
      className={`fixed bottom-6 right-6 z-40 w-10 h-10 rounded-full shadow-lg bg-primary/90 hover:bg-primary text-primary-foreground transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      aria-label="Vissza a tetejére"
    >
      <ArrowUp className="w-4 h-4" />
    </Button>
  );
}
