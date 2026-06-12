/** Auto-extracted from refs/ke_live_home.html (753KB) */

export type RevLayer = {
  id: string
  type: string
  text: string
  dataColor: string | null
  dataText: string | null
  dataXy: string | null
  dataDim: string | null
  image: string | null
  zIndex: string | null
}

export type RevSlide = { key: string; bg: string | null; layers: RevLayer[] }

export const RS_PREMIUM_SLIDE_KEY = 'rs-35'

export const REV_LAYER_TEXT_OVERRIDES: Record<string, string> = {
  "slider-6-slide-18-layer-3": "לקניון Express",
  "slider-6-slide-18-layer-7": "BEST",
  "slider-6-slide-20-layer-4": "THE NEW STANDARD",
  "slider-6-slide-20-layer-5": "SIMPLY THE",
  "slider-6-slide-33-layer-4": "THE NEW STANDARD",
  "slider-6-slide-33-layer-5": "SIMPLY THE",
  "slider-6-slide-35-layer-2": "PREMIUM",
  "slider-6-slide-35-layer-3": "PRODUCT",
  "slider-6-slide-35-layer-4": "THE NEW STANDARD",
  "slider-6-slide-35-layer-5": "SIMPLY THE"
}

export const REV_LAYER_TEXT_OVERRIDES_OTHER: Record<string, string> = {
  "slider-6-slide-18-layer-3": "לקניון Express",
  "slider-6-slide-18-layer-7": "BEST",
  "slider-6-slide-20-layer-4": "THE NEW STANDARD",
  "slider-6-slide-20-layer-5": "SIMPLY THE",
  "slider-6-slide-33-layer-4": "THE NEW STANDARD",
  "slider-6-slide-33-layer-5": "SIMPLY THE"
}

export const REV_LAYER_LTR: Set<string> = new Set(["slider-6-slide-18-layer-5","slider-6-slide-18-layer-7","slider-6-slide-35-layer-2","slider-6-slide-35-layer-3","slider-6-slide-35-layer-4","slider-6-slide-35-layer-5","slider-6-slide-35-layer-7","slider-6-slide-20-layer-4","slider-6-slide-20-layer-5","slider-6-slide-20-layer-7","slider-6-slide-33-layer-4","slider-6-slide-33-layer-5","slider-6-slide-33-layer-7"])

export const KE_LIVE_REV_SLIDES: RevSlide[] = [
  {
    "key": "rs-18",
    "bg": "c:#eef7f9;",
    "layers": [
      {
        "id": "slider-6-slide-18-layer-1",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "l:22;a:inherit;",
        "dataXy": "xo:364px,484px,361px,325px;y:t,m,m,m;yo:21px,0,0,-23px;",
        "dataDim": "w:370px,200px,200px,170px;h:495px,268px,268px,227px;",
        "image": "/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif",
        "zIndex": "5"
      },
      {
        "id": "slider-6-slide-18-layer-2",
        "type": "text",
        "text": "ברוכים הבאים",
        "dataColor": "#333e48",
        "dataText": "s:58,58,43,43;l:58,58,43,43;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,61px,31px;yo:53px,53px,71px,31px;",
        "dataDim": null,
        "image": null,
        "zIndex": "6"
      },
      {
        "id": "slider-6-slide-18-layer-3",
        "type": "text",
        "text": "לקניון Express",
        "dataColor": "#333e48",
        "dataText": "s:51,51,38,38;l:51,51,38,38;ls:-1px;fw:300;a:inherit;",
        "dataXy": "xo:78px,78px,61px,31px;yo:113px,113px,115px,73px;",
        "dataDim": null,
        "image": null,
        "zIndex": "7"
      },
      {
        "id": "slider-6-slide-18-layer-4",
        "type": "text",
        "text": "מסדרים לך בילוי. . .",
        "dataColor": "#333e48",
        "dataText": "s:19,19,11,11;l:19,19,11,11;ls:0,0,0px,0px;fw:700;a:inherit;",
        "dataXy": "xo:31px,31px,61px,31px;yo:171px,171px,163px,123px;",
        "dataDim": null,
        "image": null,
        "zIndex": "8"
      },
      {
        "id": "slider-6-slide-18-layer-5",
        "type": "text",
        "text": "SIMPLY THE",
        "dataColor": "#333e48",
        "dataText": "s:15,15,12,12;l:15,15,12,12;a:inherit;",
        "dataXy": "xo:42px,42px,61px,31px;yo:210px,210px,190px,150px;",
        "dataDim": null,
        "image": null,
        "zIndex": "9"
      },
      {
        "id": "slider-6-slide-18-layer-7",
        "type": "text",
        "text": "BEST",
        "dataColor": "#333e48",
        "dataText": "s:45,45,35,35;l:50,50,35,35;fw:700;a:inherit;",
        "dataXy": "xo:41px,41px,61px,43px;yo:228px,228px,209px,169px;",
        "dataDim": "w:111px,111px,auto,auto;",
        "image": null,
        "zIndex": "10"
      }
    ]
  },
  {
    "key": "rs-35",
    "bg": "c:#EEF7F9;",
    "layers": [
      {
        "id": "slider-6-slide-35-layer-1",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "l:22;a:inherit;",
        "dataXy": "xo:380px,380px,398px,318px;yo:-15px,-15px,10px,33px;",
        "dataDim": "w:488px,488px,309px,273px;h:447px,447px,283px,250px;",
        "image": "/images/hero/slider/redPhone-1-1.png",
        "zIndex": "5"
      },
      {
        "id": "slider-6-slide-35-layer-2",
        "type": "text",
        "text": "PREMIUM",
        "dataColor": "#333e48",
        "dataText": "s:58,58,43,43;l:58,58,43,43;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:51px,51px,71px,71px;",
        "dataDim": null,
        "image": null,
        "zIndex": "6"
      },
      {
        "id": "slider-6-slide-35-layer-3",
        "type": "text",
        "text": "PRODUCT",
        "dataColor": "#333e48",
        "dataText": "s:51,51,38,38;l:51,51,38,38;ls:-1px;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:113px,113px,115px,115px;",
        "dataDim": null,
        "image": null,
        "zIndex": "7"
      },
      {
        "id": "slider-6-slide-35-layer-4",
        "type": "text",
        "text": "THE NEW STANDARD",
        "dataColor": "#333e48",
        "dataText": "s:15,15,11,11;l:15,15,11,11;fw:700;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:171px,171px,163px,163px;",
        "dataDim": null,
        "image": null,
        "zIndex": "8"
      },
      {
        "id": "slider-6-slide-35-layer-5",
        "type": "text",
        "text": "SIMPLY THE",
        "dataColor": "#333e48",
        "dataText": "s:13,13,12,12;l:13,13,12,12;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:210px,210px,191px,190px;",
        "dataDim": null,
        "image": null,
        "zIndex": "9"
      },
      {
        "id": "slider-6-slide-35-layer-7",
        "type": "text",
        "text": "BEST",
        "dataColor": "#333e48",
        "dataText": "s:50,50,35,35;l:50,50,35,35;ls:0,0,0px,0;fw:700;a:inherit;",
        "dataXy": "xo:31px,31px,83px,60px;yo:225px,225px,209px,209px;",
        "dataDim": null,
        "image": null,
        "zIndex": "10"
      }
    ]
  },
  {
    "key": "rs-20",
    "bg": "c:#EEF7F9;",
    "layers": [
      {
        "id": "slider-6-slide-20-layer-1",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "l:22;a:inherit;",
        "dataXy": "xo:353px,353px,398px,318px;yo:17px,17px,10px,33px;",
        "dataDim": "w:410px,410px,309px,273px;h:376px,376px,283px,250px;",
        "image": "/images/hero/slider/Smartwatches1.png",
        "zIndex": "5"
      },
      {
        "id": "slider-6-slide-20-layer-2",
        "type": "text",
        "text": "ממשק",
        "dataColor": "#333e48",
        "dataText": "s:58,58,43,43;l:58,58,43,43;fw:300;a:inherit;",
        "dataXy": "xo:78px,78px,81px,61px;yo:53px,53px,71px,71px;",
        "dataDim": null,
        "image": null,
        "zIndex": "6"
      },
      {
        "id": "slider-6-slide-20-layer-3",
        "type": "text",
        "text": "מהיר ונוח",
        "dataColor": "#333e48",
        "dataText": "s:51,51,38,38;l:51,51,38,38;ls:-1px;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:113px,113px,115px,115px;",
        "dataDim": null,
        "image": null,
        "zIndex": "7"
      },
      {
        "id": "slider-6-slide-20-layer-4",
        "type": "text",
        "text": "THE NEW STANDARD",
        "dataColor": "#333e48",
        "dataText": "s:15,15,11,11;l:15,15,11,11;fw:700;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:171px,171px,163px,163px;",
        "dataDim": null,
        "image": null,
        "zIndex": "8"
      },
      {
        "id": "slider-6-slide-20-layer-5",
        "type": "text",
        "text": "SIMPLY THE",
        "dataColor": "#333e48",
        "dataText": "s:13,13,12,12;l:13,13,12,12;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:210px,210px,191px,190px;",
        "dataDim": null,
        "image": null,
        "zIndex": "9"
      },
      {
        "id": "slider-6-slide-20-layer-7",
        "type": "text",
        "text": "BEST",
        "dataColor": "#333e48",
        "dataText": "s:50,50,35,35;l:50,50,35,35;ls:0,0,0px,0;fw:700;a:inherit;",
        "dataXy": "xo:32px,32px,83px,60px;yo:225px,225px,209px,209px;",
        "dataDim": null,
        "image": null,
        "zIndex": "10"
      }
    ]
  },
  {
    "key": "rs-33",
    "bg": "c:#EEF7F9;",
    "layers": [
      {
        "id": "slider-6-slide-33-layer-1",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "l:22;a:inherit;",
        "dataXy": "xo:358px,358px,398px,318px;yo:9px,9px,10px,33px;",
        "dataDim": "w:428px,428px,309px,273px;h:392px,392px,283px,250px;",
        "image": "/images/hero/slider/iapdlap.png",
        "zIndex": "5"
      },
      {
        "id": "slider-6-slide-33-layer-2",
        "type": "text",
        "text": "תצוגה",
        "dataColor": "#333e48",
        "dataText": "s:58,58,43,43;l:58,58,43,43;fw:300;a:inherit;",
        "dataXy": "xo:52px,52px,81px,61px;yo:50px,50px,71px,71px;",
        "dataDim": null,
        "image": null,
        "zIndex": "6"
      },
      {
        "id": "slider-6-slide-33-layer-3",
        "type": "text",
        "text": "מושלמת",
        "dataColor": "#333e48",
        "dataText": "s:51,51,38,38;l:51,51,38,38;ls:-1px;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:113px,113px,115px,115px;",
        "dataDim": null,
        "image": null,
        "zIndex": "7"
      },
      {
        "id": "slider-6-slide-33-layer-4",
        "type": "text",
        "text": "THE NEW STANDARD",
        "dataColor": "#333e48",
        "dataText": "s:15,15,11,11;l:15,15,11,11;fw:700;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:171px,171px,163px,163px;",
        "dataDim": null,
        "image": null,
        "zIndex": "8"
      },
      {
        "id": "slider-6-slide-33-layer-5",
        "type": "text",
        "text": "SIMPLY THE",
        "dataColor": "#333e48",
        "dataText": "s:13,13,12,12;l:13,13,12,12;a:inherit;",
        "dataXy": "xo:31px,31px,81px,61px;yo:210px,210px,191px,190px;",
        "dataDim": null,
        "image": null,
        "zIndex": "9"
      },
      {
        "id": "slider-6-slide-33-layer-7",
        "type": "text",
        "text": "BEST",
        "dataColor": "#333e48",
        "dataText": "s:50,50,35,35;l:50,50,35,35;ls:0,0,0px,0;fw:700;a:inherit;",
        "dataXy": "xo:32px,32px,83px,60px;yo:225px,225px,209px,209px;",
        "dataDim": null,
        "image": null,
        "zIndex": "10"
      }
    ]
  },
  {
    "key": "rs-19",
    "bg": "c:#eef7f9;",
    "layers": [
      {
        "id": "slider-6-slide-19-layer-0",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "w:normal;s:20,20,18,13;l:0,0,23,17;",
        "dataXy": "xo:25px,25px,23px,17px;yo:222px,222px,205px,154px;",
        "dataDim": "w:286px,286px,264px,199px;h:46px,46px,42px,31px;",
        "image": "/images/hero/slider/Screen-Shot-2021-11-12-at-0.20.17.png",
        "zIndex": "8"
      },
      {
        "id": "slider-6-slide-19-layer-3",
        "type": "text",
        "text": "בקרוב",
        "dataColor": "#333e48",
        "dataText": "s:51,51,38,38;l:51,51,38,38;ls:-1px;fw:300;a:inherit;",
        "dataXy": "xo:101px,101px,82px,51px;yo:124px,124px,105px,115px;",
        "dataDim": null,
        "image": null,
        "zIndex": "7"
      },
      {
        "id": "slider-6-slide-19-layer-5",
        "type": "text",
        "text": "האפליקציה",
        "dataColor": "#333e48",
        "dataText": "s:58,58,43,43;l:58,58,43,43;fw:300;a:inherit;",
        "dataXy": "xo:31px,31px,81px,51px;yo:52px,52px,61px,71px;",
        "dataDim": null,
        "image": null,
        "zIndex": "6"
      },
      {
        "id": "slider-6-slide-19-layer-11",
        "type": "image",
        "text": "",
        "dataColor": null,
        "dataText": "l:22;a:inherit;",
        "dataXy": "xo:347px,347px,429px,306px;yo:-1px,-1px,16px,33px;",
        "dataDim": "w:419px,419px,258px,239px;h:425px,425px,289px,267px;",
        "image": "/images/hero/slider/Screen-Shot-2021-11-09-at-6.41.46.png",
        "zIndex": "5"
      }
    ]
  }
]
