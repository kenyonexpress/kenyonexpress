# Electro home-v7 measurements (380×667)

Pixel-exact box model capture of
https://electro.madrasthemes.com/home-v7/
at viewport **380×667**.

## Method

- Approach: Playwright Chromium headless (`getBoundingClientRect` + `getComputedStyle`)
- Fallback note: cursor-ide-browser MCP could not keep a stable tab (`No browser tab available` / viewId evaporating); Playwright used instead
- Screenshot: `refs/electro-measure-380x667.png`

## Summary table

| Region | Selector | Width (px) | Height (px) | Top (px) |
|--------|----------|------------|-------------|----------|
| Header | #masthead | 380 | 55.52 | 0 |
| Top bar | .top-bar | 0 | 0 | visible=false |
| Hero slider | rs-module-wrap | 348 | 192 | 55.52 |
| Product card | first `li.product` | 175 | 273.75 | 1107.17 |
| Footer | #colophon | 380 | 576.3 | 8215.22 |

## Pixel-exact JSON

```json
{
  "meta": {
    "source": "https://electro.madrasthemes.com/home-v7/",
    "measuredAt": "2026-08-11T16:39:18.078Z",
    "approach": "playwright_chromium_headless_getBoundingClientRect",
    "httpStatus": 200,
    "notes": [
      "cursor-ide-browser MCP tabs failed to stay open; used Playwright chromium headless + getBoundingClientRect",
      "Node v25 requires global.URL polyfill before requiring @playwright/test"
    ],
    "requestedViewport": {
      "width": 380,
      "height": 667
    },
    "actualViewport": {
      "innerWidth": 380,
      "innerHeight": 667,
      "devicePixelRatio": 1,
      "scrollHeight": 8792
    },
    "title": "Home v7 – Electro",
    "screenshot": "refs/electro-measure-380x667.png"
  },
  "header": {
    "topBar": {
      "matchedSelector": ".top-bar",
      "visible": false,
      "display": "none",
      "box": {
        "width": 0,
        "height": 0,
        "top": 0,
        "left": 0
      }
    },
    "mainHeader": {
      "matchedSelector": "#masthead",
      "className": "site-header header-v8",
      "box": {
        "tag": "header",
        "id": "masthead",
        "className": "site-header header-v8",
        "width": 380,
        "height": 55.52,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "fontSize": "14px",
      "color": "rgb(51, 62, 72)"
    },
    "sticky": null,
    "logo": {
      "tag": "img",
      "id": null,
      "className": "vc_single_image-img attachment-full",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "display": "inline",
      "position": "static",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "search": {
      "matchedSelector": ".navbar-search",
      "note": "present in DOM but width 0 at this breakpoint (desktop search collapsed into handheld header)",
      "box": {
        "tag": "form",
        "id": null,
        "className": "navbar-search col",
        "width": 0,
        "height": 0,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "15px",
        "bottom": "0px",
        "left": "15px"
      }
    },
    "navPrimary": null
  },
  "heroSlider": {
    "slider": {
      "matchedSelector": "rs-module-wrap",
      "box": {
        "tag": "rs-module-wrap",
        "id": "rev_slider_6_1_wrapper",
        "className": "",
        "width": 348,
        "height": 192,
        "top": 55.52,
        "left": 16,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "relative",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      }
    },
    "slide": {
      "tag": "rs-slide",
      "id": null,
      "className": "",
      "width": 348,
      "height": 192,
      "top": 55.52,
      "left": 16,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "display": "block",
      "position": "absolute",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "controls": {
      "tag": "rs-bullets",
      "id": null,
      "className": "tp-bullets custom horizontal nav-pos-hor-left nav-pos-ver-bottom nav-dir-horizontal",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "display": "none",
      "position": "absolute",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "dots": {
      "tag": "rs-bullets",
      "id": null,
      "className": "tp-bullets custom horizontal nav-pos-hor-left nav-pos-ver-bottom nav-dir-horizontal",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "display": "none",
      "position": "absolute",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "arrows": {
      "tag": "div",
      "id": null,
      "className": "owl-nav",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "display": "none",
      "position": "static",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    }
  },
  "categoryStrip": {
    "strip": {
      "matchedSelector": null,
      "box": null,
      "note": "no standalone product-categories-carousel at this breakpoint; category UI is inside .vertical-menu-slider-category-with-das hero block"
    },
    "items": [],
    "heroCategoryBlock": {
      "index": 2,
      "tag": "div",
      "className": "vertical-menu-slider-category-with-das",
      "id": null,
      "top": 55.52,
      "width": 380,
      "height": 895
    }
  },
  "cardGrid": {
    "section": {
      "matchedSelector": ".products-carousel",
      "box": {
        "tag": "div",
        "id": null,
        "className": "products owl-carousel products-carousel products list-unstyled row g-0 row-cols-2 row-cols-md-3 row-cols-lg-7 row-cols-xl-7 row-cols-xxl-5 owl-loaded owl-drag",
        "width": 350,
        "height": 273.75,
        "top": 1107.17,
        "left": 15,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "relative",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      }
    },
    "gap": {
      "horizontalGap": 0,
      "verticalGap": -273.75,
      "sameRow": true
    },
    "firstCard": {
      "card": {
        "tag": "div",
        "id": null,
        "className": "product type-product post-2440 status-publish first instock product_cat-accessories product_cat-headphone-cases has-post-thumbnail shipping-taxable purchasable product-type-simple",
        "width": 175,
        "height": 273.75,
        "top": 1107.17,
        "left": 16,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "image": {
        "tag": "img",
        "id": null,
        "className": "attachment-woocommerce_thumbnail size-woocommerce_thumbnail",
        "width": 147,
        "height": 147,
        "top": 1173.95,
        "left": 30,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "title": {
        "tag": "h2",
        "id": null,
        "className": "woocommerce-loop-product__title",
        "width": 147,
        "height": 28,
        "top": 1137.95,
        "left": 30,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "8px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal",
        "fontSize": "11.998px",
        "fontWeight": "700",
        "color": "rgb(0, 98, 189)",
        "lineHeight": "14.0017px"
      },
      "price": {
        "tag": "span",
        "id": null,
        "className": "price",
        "width": 59.22,
        "height": 16,
        "top": 1340.92,
        "left": 30,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal",
        "fontSize": "16.002px",
        "fontWeight": "400",
        "color": "rgb(51, 62, 72)"
      },
      "badge": null,
      "category": {
        "tag": "a",
        "id": null,
        "className": "",
        "width": 63.55,
        "height": 14,
        "top": 1119.17,
        "left": 30,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "inline",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal",
        "fontSize": "11.2px",
        "color": "rgb(118, 139, 158)"
      }
    },
    "cardsSample": [
      {
        "index": 0,
        "box": {
          "tag": "div",
          "id": null,
          "className": "product type-product post-2440 status-publish first instock product_cat-accessories product_cat-headphone-cases has-post-thumbnail shipping-taxable purchasable product-type-simple",
          "width": 175,
          "height": 273.75,
          "top": 1107.17,
          "left": 16,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "index": 1,
        "box": {
          "tag": "div",
          "id": null,
          "className": "product type-product post-2441 status-publish instock product_cat-accessories product_cat-headphone-accessories has-post-thumbnail shipping-taxable purchasable product-type-simple",
          "width": 175,
          "height": 273.75,
          "top": 1107.17,
          "left": 189,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "index": 2,
        "box": {
          "tag": "div",
          "id": null,
          "className": "product type-product post-2439 status-publish instock product_cat-accessories product_cat-headphones product_tag-fast product_tag-gaming product_tag-strong has-post-thumbnail shipping-taxable purchasa",
          "width": 175,
          "height": 273.75,
          "top": 1107.17,
          "left": 189,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "index": 3,
        "box": {
          "tag": "div",
          "id": null,
          "className": "product type-product post-2599 status-publish onbackorder product_cat-game-consoles product_cat-video-games-consoles has-post-thumbnail sale shipping-taxable purchasable product-type-simple",
          "width": 175,
          "height": 273.75,
          "top": 1107.17,
          "left": 189,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      }
    ]
  },
  "typography": {
    "headings": [
      {
        "index": 0,
        "box": {
          "tag": "h2",
          "id": null,
          "className": "h1",
          "width": 190.06,
          "height": 61.2,
          "top": 5806.81,
          "left": 15,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "6.8px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "relative",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        },
        "fontSize": "17px",
        "fontWeight": "700",
        "color": "rgb(51, 62, 72)",
        "lineHeight": "27.2px",
        "className": "h1"
      }
    ],
    "bodyFontSize": "14px",
    "bodyColor": "rgb(51, 62, 72)",
    "prices": [
      {
        "fontSize": "15.988px",
        "color": "rgb(51, 62, 72)",
        "box": {
          "tag": "span",
          "id": null,
          "className": "woocommerce-Price-amount amount",
          "width": 0,
          "height": 0,
          "top": 0,
          "left": 0,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "inline",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "fontSize": "16.002px",
        "color": "rgb(51, 62, 72)",
        "box": {
          "tag": "span",
          "id": null,
          "className": "woocommerce-Price-amount amount",
          "width": 59.22,
          "height": 20,
          "top": 1338.92,
          "left": 30,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "inline",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "fontSize": "16.002px",
        "color": "rgb(51, 62, 72)",
        "box": {
          "tag": "span",
          "id": null,
          "className": "woocommerce-Price-amount amount",
          "width": 53.02,
          "height": 20,
          "top": 1338.92,
          "left": 205,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "inline",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      },
      {
        "fontSize": "16.002px",
        "color": "rgb(51, 62, 72)",
        "box": {
          "tag": "span",
          "id": null,
          "className": "woocommerce-Price-amount amount",
          "width": 62.77,
          "height": 20,
          "top": 1338.92,
          "left": 301,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "0px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "inline",
          "position": "static",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        }
      }
    ],
    "badges": []
  },
  "containers": [
    {
      "index": 0,
      "box": {
        "tag": "div",
        "id": null,
        "className": "container clearfix",
        "width": 0,
        "height": 0,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "auto",
          "bottom": "0px",
          "left": "auto"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "15px",
        "bottom": "0px",
        "left": "15px"
      },
      "className": "container clearfix"
    },
    {
      "index": 1,
      "box": {
        "tag": "div",
        "id": null,
        "className": "container hidden-lg-down d-none d-xl-block",
        "width": 0,
        "height": 0,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "auto",
          "bottom": "0px",
          "left": "auto"
        },
        "display": "none",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "15px",
        "bottom": "0px",
        "left": "15px"
      },
      "className": "container hidden-lg-down d-none d-xl-block"
    },
    {
      "index": 2,
      "box": {
        "tag": "div",
        "id": null,
        "className": "handheld-header-wrap container hidden-xl-up d-xl-none",
        "width": 380,
        "height": 54.52,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "15px",
        "bottom": "0px",
        "left": "15px"
      },
      "className": "handheld-header-wrap container hidden-xl-up d-xl-none"
    },
    {
      "index": 3,
      "box": {
        "tag": "div",
        "id": null,
        "className": "container",
        "width": 380,
        "height": 7954.2,
        "top": 55.52,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "padding": {
        "top": "0px",
        "right": "15px",
        "bottom": "0px",
        "left": "15px"
      },
      "className": "container"
    }
  ],
  "footer": {
    "footer": {
      "matchedSelector": "#colophon",
      "box": {
        "tag": "footer",
        "id": "colophon",
        "className": "site-footer footer-v2",
        "width": 380,
        "height": 576.3,
        "top": 8215.22,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      }
    },
    "widgets": {
      "tag": "div",
      "id": null,
      "className": "footer-widgets row row-cols-lg-2 row-cols-xl-4",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "-15px",
        "bottom": "45.003px",
        "left": "-15px"
      },
      "display": "flex",
      "position": "static",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "columns": [],
    "newsletter": {
      "tag": "div",
      "id": null,
      "className": "footer-newsletter",
      "width": 0,
      "height": 0,
      "top": 0,
      "left": 0,
      "padding": {
        "top": "7.7px",
        "right": "0px",
        "bottom": "7.7px",
        "left": "0px"
      },
      "margin": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "calc(50% - 190px)"
      },
      "display": "block",
      "position": "relative",
      "gap": "normal",
      "columnGap": "normal",
      "rowGap": "normal"
    },
    "bottom": {
      "matchedSelector": ".copyright",
      "box": {
        "tag": "div",
        "id": null,
        "className": "float-start copyright",
        "width": 0,
        "height": 0,
        "top": 0,
        "left": 0,
        "padding": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "margin": {
          "top": "0px",
          "right": "0px",
          "bottom": "0px",
          "left": "0px"
        },
        "display": "block",
        "position": "static",
        "gap": "normal",
        "columnGap": "normal",
        "rowGap": "normal"
      },
      "backgroundColor": "rgba(0, 0, 0, 0)",
      "fontSize": "14px",
      "color": "rgb(51, 62, 72)",
      "padding": {
        "top": "0px",
        "right": "0px",
        "bottom": "0px",
        "left": "0px"
      }
    }
  },
  "sectionOrder": [
    {
      "name": "topBar",
      "selector": ".top-bar",
      "top": 0,
      "height": 0,
      "width": 0
    },
    {
      "name": "header",
      "selector": "#masthead",
      "top": 0,
      "height": 55.52,
      "width": 380
    },
    {
      "name": "hero",
      "selector": "rs-module-wrap",
      "top": 55.52,
      "height": 192,
      "width": 348
    },
    {
      "name": "products",
      "selector": "ul.products",
      "top": 2139.72,
      "height": 1098,
      "width": 350
    },
    {
      "name": "footer",
      "selector": "#colophon",
      "top": 8215.22,
      "height": 576.3,
      "width": 380
    }
  ],
  "homepageSectionsTopToBottom": [
    {
      "index": 0,
      "tag": "div",
      "className": "container",
      "id": null,
      "top": 55.52,
      "width": 380,
      "height": 7954.2
    },
    {
      "index": 1,
      "tag": "main",
      "className": "site-main",
      "id": "main",
      "top": 55.52,
      "width": 350,
      "height": 7954.2
    },
    {
      "index": 2,
      "tag": "div",
      "className": "vertical-menu-slider-category-with-das",
      "id": null,
      "top": 55.52,
      "width": 380,
      "height": 895
    },
    {
      "index": 3,
      "tag": "section",
      "className": "section-products-carousel products-carousel-with-timer products-carousel-with-timer",
      "id": null,
      "top": 950.52,
      "width": 350,
      "height": 430.41
    },
    {
      "index": 4,
      "tag": "div",
      "className": "home-v7-banner-block",
      "id": null,
      "top": 1408.92,
      "width": 350,
      "height": 35.72
    },
    {
      "index": 5,
      "tag": "section",
      "className": "products-with-category-image",
      "id": null,
      "top": 1483.64,
      "width": 350,
      "height": 1754.08
    },
    {
      "index": 6,
      "tag": "div",
      "className": "home-v7-da-block home-two-banners",
      "id": null,
      "top": 3265.72,
      "width": 350,
      "height": 76.59
    },
    {
      "index": 7,
      "tag": "section",
      "className": "products-category-with-image",
      "id": null,
      "top": 3370.31,
      "width": 350,
      "height": 1190.25
    },
    {
      "index": 8,
      "tag": "section",
      "className": "products-category-with-image",
      "id": null,
      "top": 4588.56,
      "width": 350,
      "height": 1190.25
    },
    {
      "index": 9,
      "tag": "section",
      "className": "two-row-products",
      "id": null,
      "top": 5806.81,
      "width": 350,
      "height": 1709.7
    },
    {
      "index": 10,
      "tag": "section",
      "className": "das-with-banners",
      "id": null,
      "top": 7544.52,
      "width": 350,
      "height": 465.2
    }
  ]
}
```
