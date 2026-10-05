import * as React from "react";
import { cn } from "../../lib/utils";
import styles from "./avatar.module.css";

interface AvatarContextValue {
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
  imageError: boolean;
  setImageError: (error: boolean) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

const Avatar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);

  return (
    <AvatarContext.Provider
      value={{ imageLoaded, setImageLoaded, imageError, setImageError }}
    >
      <div
        ref={ref}
        className={cn(styles.avatar, className)}
        {...props}
      >
        {children}
      </div>
    </AvatarContext.Provider>
  );
});
Avatar.displayName = "Avatar";

const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement>
>(({ className, src, alt = "", ...props }, ref) => {
  const context = React.useContext(AvatarContext);

  if (!src) return null;

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onLoad={() => context?.setImageLoaded(true)}
      onError={() => context?.setImageError(true)}
      className={cn(
        styles.image,
        context?.imageError ? "hidden" : "block",
        className
      )}
      {...props}
    />
  );
});
AvatarImage.displayName = "AvatarImage";

const AvatarFallback = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const context = React.useContext(AvatarContext);

  if (context?.imageLoaded && !context.imageError) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(styles.fallback, className)}
      {...props}
    />
  );
});
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };
