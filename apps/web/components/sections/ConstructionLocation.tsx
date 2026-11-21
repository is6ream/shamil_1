import Image from "next/image";

import { ArrowRightIcon } from "@/components/icons/Icons";
import { SECTION_IDS } from "@/lib/content";

import styles from "./ConstructionLocation.module.css";

const ROUTE_URL =
  "https://2gis.ru/ufa/directions/tab/car/points/56.029044550796684,54.76837574478366%7C55.94815417192876,54.7759599871585;2393147187396612";

export function ConstructionLocation() {
  return (
    <section className={styles.section} id={SECTION_IDS.route} aria-labelledby="construction-location-title">
      <h2 className={styles.title} id="construction-location-title">Как добраться</h2>
      <div className={styles.card}>
        <figure className={styles.map}>
          <Image
            src="/landing/map.jpg"
            width={1160}
            height={850}
            sizes="(max-width: 850px) 100vw, 50vw"
            alt="Карта района Затонского шоссе в Уфе"
          />
          <figcaption>Схема района · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a></figcaption>
        </figure>
        <div className={styles.details}>
          <div>
            <strong>Строительство мечети «Шамиль»</strong>
            <p>Уфа, Республика Башкортостан</p>
          </div>
          <a className="btn btn-primary" href={ROUTE_URL} target="_blank" rel="noopener noreferrer">
            Маршрут в 2ГИС <ArrowRightIcon />
            <span className="sr-only"> (новая вкладка)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
