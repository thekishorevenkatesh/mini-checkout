import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ProductImageGalleryProps = {
  productId: string;
  title: string;
  images: string[];
  className?: string;
  children?: ReactNode;
};

export function ProductImageGallery({
  productId,
  title,
  images,
  className = "aspect-square",
  children,
}: ProductImageGalleryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lightboxScrollRef = useRef<HTMLDivElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const safeImages = images.filter(Boolean);
  const imageCount = safeImages.length;

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;

    const index = Math.round(
      element.scrollLeft / Math.max(1, element.clientWidth)
    );

    setActiveIndex(index);
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  useEffect(() => {
    if (!lightboxOpen || !lightboxScrollRef.current) return;

    const element = lightboxScrollRef.current;

    element.scrollTo({
      left: element.clientWidth * lightboxIndex,
      behavior: "instant" as ScrollBehavior,
    });
  }, [lightboxIndex, lightboxOpen]);

  useEffect(() => {
    if (!lightboxOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [lightboxOpen]);

  return (
    <>
      <div
        className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`}
      >
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {imageCount > 0 ? (
            safeImages.map((imageUrl, index) => (
              <button
                key={`${productId}-img-${index}`}
                type="button"
                onClick={() => openLightbox(index)}
                className="h-full min-w-full shrink-0 snap-center cursor-zoom-in focus:outline-none"
              >
                <img
                  src={imageUrl}
                  alt={`${title} image ${index + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))
          ) : (
            <div className="h-full w-full bg-slate-200 dark:bg-slate-900" />
          )}
        </div>

        {imageCount > 1 && (
          <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
            {safeImages.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex
                    ? "w-4 bg-white"
                    : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        )}

        {children}
      </div>

      {lightboxOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[999] overflow-hidden bg-black"
            role="dialog"
            aria-modal="true"
            onClick={closeLightbox}
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm sm:right-4 sm:top-4"
            >
              ✕
            </button>

            <div
              ref={lightboxScrollRef}
              onClick={(e) => e.stopPropagation()}
              onScroll={() => {
                const element = lightboxScrollRef.current;
                if (!element) return;

                const index = Math.round(
                  element.scrollLeft / Math.max(1, element.clientWidth)
                );

                setLightboxIndex(index);
              }}
              className="flex h-dvh w-dvw snap-x snap-mandatory overflow-x-auto overflow-y-hidden touch-pan-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {safeImages.map((imageUrl, index) => (
                <div
                  key={`${productId}-lightbox-${index}`}
                  className="flex h-dvh w-dvw min-w-[100dvw] shrink-0 snap-center items-center justify-center p-3 sm:p-4"
                >
                  <img
                    src={imageUrl}
                    alt={`${title} full screen ${index + 1}`}
                    className="h-auto max-h-[calc(100dvh-1.5rem)] w-auto max-w-[calc(100dvw-1.5rem)] object-contain select-none sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100dvw-2rem)]"
                    style={{
                      touchAction: "pan-x pan-y pinch-zoom",
                    }}
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
