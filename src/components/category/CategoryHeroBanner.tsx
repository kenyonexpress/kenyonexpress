import Image from 'next/image'

type Props = {
  imageUrl: string | null
  categoryName: string
}

export default function CategoryHeroBanner({ imageUrl, categoryName }: Props) {
  if (!imageUrl) {
    return null
  }

  return (
    <div className="category-hero-banner">
      <Image
        src={imageUrl}
        alt={categoryName}
        fill
        className="category-hero-banner__image"
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1170px"
      />
    </div>
  )
}
