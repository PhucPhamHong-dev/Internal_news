"use client";

import Link from "next/link";
import clsx from "classnames";

type CompanyLogoProps = {
  compact?: boolean;
  className?: string;
  imageClassName?: string;
};

const LOGO_SRC = "/icons/ace-logo.png";

export function CompanyLogo({ compact = false, className, imageClassName }: CompanyLogoProps) {
  return (
    <Link href="/" className={clsx("inline-flex items-center justify-center", className)} aria-label="ACE Anh Chị Em">
      <img src={LOGO_SRC} alt="ACE Anh Chị Em" className={clsx(compact ? "h-11 w-auto" : "h-16 w-auto", imageClassName)} />
    </Link>
  );
}
