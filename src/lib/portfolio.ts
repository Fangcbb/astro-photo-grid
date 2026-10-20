import snapshot from "../../.portfolio/catalog.json";
import settings from "../../content/site.json";
export interface Photo {
  slug: string;
  title: string;
  alt: string;
  album: string;
  description: string;
  location: string;
  taken_at: string;
  width: number;
  height: number;
  src: string;
  large: string;
  srcset: string;
}
interface Catalog {
  albums: { slug: string; title: string; description: string }[];
  photos: Photo[];
}
const catalog = snapshot as Catalog;
export const site = settings;
export const photos = catalog.photos;
export const albums = catalog.albums
  .map((album) => ({
    ...album,
    photos: photos.filter((photo) => photo.album === album.slug),
  }))
  .filter((album) => album.photos.length > 0);
export type Album = (typeof albums)[number];
