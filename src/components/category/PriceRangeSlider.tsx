'use client'

import { useCallback, useMemo, useState } from 'react'

type Props = {
  min: number
  max: number
  minValue?: number
  maxValue?: number
  onApply: (min: number, max: number) => void
  isPending?: boolean
}

export default function PriceRangeSlider({
  min,
  max,
  minValue,
  maxValue,
  onApply,
  isPending,
}: Props) {
  const [localMin, setLocalMin] = useState(minValue ?? min)
  const [localMax, setLocalMax] = useState(maxValue ?? max)

  const handleMinChange = useCallback(
    (value: number) => {
      if (value <= localMax) {
        setLocalMin(value)
      }
    },
    [localMax],
  )

  const handleMaxChange = useCallback(
    (value: number) => {
      if (value >= localMin) {
        setLocalMax(value)
      }
    },
    [localMin],
  )

  const handleApply = () => {
    onApply(localMin, localMax)
  }

  const minPercent = useMemo(() => ((localMin - min) / (max - min)) * 100, [localMin, min, max])
  const maxPercent = useMemo(() => ((localMax - min) / (max - min)) * 100, [localMax, min, max])

  return (
    <div className="category-sidebar__price-slider">
      <div className="price-slider__track">
        <div
          className="price-slider__track-fill"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }}
        />
      </div>
      <div className="price-slider__inputs">
        <input
          type="range"
          min={min}
          max={max}
          value={localMin}
          onChange={(e) => handleMinChange(Number(e.target.value))}
          className="price-slider__input price-slider__input--min"
          disabled={isPending}
          aria-label="מחיר מינימלי"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={localMax}
          onChange={(e) => handleMaxChange(Number(e.target.value))}
          className="price-slider__input price-slider__input--max"
          disabled={isPending}
          aria-label="מחיר מקסימלי"
        />
      </div>
      <div className="price-slider__values">
        <span className="price-slider__value">₪{localMin}</span>
        <span className="price-slider__value">₪{localMax}</span>
      </div>
      <button
        type="button"
        className="category-sidebar__price-btn"
        onClick={handleApply}
        disabled={isPending || (localMin === minValue && localMax === maxValue)}
      >
        סינון
      </button>
    </div>
  )
}
