import Image from "next/image";

import heroArtwork from "@/public/hero/hero-bg-gold.png";

import styles from "./HeroBackdrop.module.css";

export function HeroArtwork() {
  return (
    <div className={styles.artwork}>
      <Image
        className={styles.image}
        src={heroArtwork}
        alt="Эскиз мечети «Шамиль» с минаретом и золотым орнаментом"
        preload
        sizes="100vw"
      />
    </div>
  );
}
