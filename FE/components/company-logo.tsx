"use client";

import Link from "next/link";
import clsx from "classnames";

type CompanyLogoProps = {
  compact?: boolean;
  className?: string;
  imageClassName?: string;
};

const LOGO_SRC = "https://static.wixstatic.com/media/20df35_3985cf6e76d347f08b9bdc1e4bf2d815~mv2.png/v1/crop/x_0,y_16,w_150,h_119/fill/w_184,h_144,al_c,lg_1,q_85,enc_avif,quality_auto/91505850_104574237870559_618557836888952.png";

export function CompanyLogo({ compact = false, className, imageClassName }: CompanyLogoProps) {
  return (
    <Link href="/" className={clsx("inline-flex items-center justify-center", className)} aria-label="ACE Anh Chi Em">
      <img
        src={LOGO_SRC}
        alt="ACE Anh Chi Em"
        className={clsx(compact ? "h-11 w-auto" : "h-16 w-auto", imageClassName)}
      />
    </Link>
  );
}
