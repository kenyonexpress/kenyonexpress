# Electro home-v7 measurements (768×1024)

Pixel-exact box model capture of
https://electro.madrasthemes.com/home-v7/
at viewport **768×1024**.

## Method

- Approach: Playwright Chromium headless (`getBoundingClientRect` + `getComputedStyle`)
- Fallback note: cursor-ide-browser MCP could not keep a stable tab (`No browser tab available` / viewId evaporating); Playwright used instead
- Screenshot: `refs/electro-measure-768x1024.png`

## Summary table

| Region | Selector | Width (px) | Height (px) | Top (px) |
|--------|----------|------------|-------------|----------|
| Header | #masthead | 768 | 55.52 | 0 |
| Top bar | .top-bar | 0 | 0 | visible=false |
| Hero slider | rs-module-wrap | 688 | 287 | 55.52 |
| Product card | first `li.product` | 172.5 | 271.25 | 804.5 |
| Footer | #colophon | 768 | 511.73 | 4761.69 |

## Pixel-exact JSON

```json
{
  "meta": {
    "source": "https://electro.madrasthemes.com/home-v7/",
    "measuredAt": "2026-08-11T16:39:18.085Z",
    "approach": "playwright_chromium_headless_getBoundingClientRect",
    "httpStatus": 200,
    "notes": [
      "cursor-ide-browser MCP tabs failed to stay open; used Playwright chromium headless + getBoundingClientRect",
      "Node v25 requires global.URL polyfill before requiring @playwright/test"
    ],
    "requestedViewport": {
      "width": 768,
      "height": 1024
    },
    "actualViewport": {
      "innerWidth": 768,
      "innerHeight": 1024,
      "devicePixelRatio": 1,
      "scrollHeight": 5273
    },
    "title": "Home v7 – Electro",
    "screenshot": "refs/electro-measure-768x1024.png"
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
        "width": 768,
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
        "width": 688,
        "height": 287,
        "top": 55.52,
        "left": 40,
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
      "width": 688,
      "height": 287,
      "top": 55.52,
      "left": 40,
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
      "width": 768,
      "height": 648
    }
  },
  "cardGrid": {
    "section": {
      "matchedSelector": ".products-carousel",
      "box": {
        "tag": "div",
        "id": null,
        "className": "products owl-carousel products-carousel products list-unstyled row g-0 row-cols-2 row-cols-md-3 row-cols-lg-7 row-cols-xl-7 row-cols-xxl-5 owl-loaded owl-drag",
        "width": 690,
        "height": 295.23,
        "top": 804.5,
        "left": 39,
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
      "verticalGap": -271.25,
      "sameRow": true
    },
    "firstCard": {
      "card": {
        "tag": "div",
        "id": null,
        "className": "product type-product post-2440 status-publish first instock product_cat-accessories product_cat-headphone-cases has-post-thumbnail shipping-taxable purchasable product-type-simple",
        "width": 172.5,
        "height": 271.25,
        "top": 804.5,
        "left": 40,
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
        "width": 144.5,
        "height": 144.5,
        "top": 871.28,
        "left": 54,
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
        "width": 144.5,
        "height": 28,
        "top": 835.28,
        "left": 54,
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
        "top": 1035.75,
        "left": 54,
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
        "top": 816.5,
        "left": 54,
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
          "width": 172.5,
          "height": 271.25,
          "top": 804.5,
          "left": 40,
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
          "width": 172.5,
          "height": 271.25,
          "top": 804.5,
          "left": 212.5,
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
          "width": 172.5,
          "height": 271.25,
          "top": 804.5,
          "left": 385,
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
          "width": 172.5,
          "height": 271.25,
          "top": 804.5,
          "left": 555.5,
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
          "width": 263.55,
          "height": 43.98,
          "top": 2905.66,
          "left": 39,
          "padding": {
            "top": "0px",
            "right": "0px",
            "bottom": "8.7976px",
            "left": "0px"
          },
          "margin": {
            "top": "0px",
            "right": "20px",
            "bottom": "0px",
            "left": "0px"
          },
          "display": "block",
          "position": "relative",
          "gap": "normal",
          "columnGap": "normal",
          "rowGap": "normal"
        },
        "fontSize": "21.994px",
        "fontWeight": "400",
        "color": "rgb(51, 62, 72)",
        "lineHeight": "35.1904px",
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
          "top": 1033.75,
          "left": 54,
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
          "top": 1033.75,
          "left": 226.5,
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
          "top": 1033.75,
          "left": 399,
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
        "width": 768,
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
        "width": 720,
        "height": 4540.67,
        "top": 55.52,
        "left": 24,
        "padding": {
          "top": "0px",
          "right": "15px",
          "bottom": "0px",
          "left": "15px"
        },
        "margin": {
          "top": "0px",
          "right": "24px",
          "bottom": "0px",
          "left": "24px"
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
        "width": 768,
        "height": 511.73,
        "top": 4761.69,
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
        "left": "calc(50% - 392px)"
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
      "width": 768
    },
    {
      "name": "hero",
      "selector": "rs-module-wrap",
      "top": 55.52,
      "height": 287,
      "width": 688
    },
    {
      "name": "products",
      "selector": "ul.products",
      "top": 1367.08,
      "height": 648.14,
      "width": 351.89
    },
    {
      "name": "footer",
      "selector": "#colophon",
      "top": 4761.69,
      "height": 511.73,
      "width": 768
    }
  ],
  "homepageSectionsTopToBottom": [
    {
      "index": 0,
      "tag": "div",
      "className": "container",
      "id": null,
      "top": 55.52,
      "width": 720,
      "height": 4540.67
    },
    {
      "index": 1,
      "tag": "main",
      "className": "site-main",
      "id": "main",
      "top": 55.52,
      "width": 690,
      "height": 4540.67
    },
    {
      "index": 2,
      "tag": "div",
      "className": "vertical-menu-slider-category-with-das",
      "id": null,
      "top": 55.52,
      "width": 768,
      "height": 648
    },
    {
      "index": 3,
      "tag": "section",
      "className": "section-products-carousel products-carousel-with-timer products-carousel-with-timer",
      "id": null,
      "top": 703.52,
      "width": 690,
      "height": 396.22
    },
    {
      "index": 4,
      "tag": "div",
      "className": "home-v7-banner-block",
      "id": null,
      "top": 1139.72,
      "width": 690,
      "height": 70.42
    },
    {
      "index": 5,
      "tag": "section",
      "className": "products-with-category-image",
      "id": null,
      "top": 1249.14,
      "width": 690,
      "height": 766.08
    },
    {
      "index": 6,
      "tag": "div",
      "className": "home-v7-da-block home-two-banners",
      "id": null,
      "top": 2055.2,
      "width": 690,
      "height": 73.3
    },
    {
      "index": 7,
      "tag": "section",
      "className": "products-category-with-image",
      "id": null,
      "top": 2156.5,
      "width": 690,
      "height": 334.59
    },
    {
      "index": 8,
      "tag": "section",
      "className": "products-category-with-image",
      "id": null,
      "top": 2531.08,
      "width": 690,
      "height": 334.59
    },
    {
      "index": 9,
      "tag": "section",
      "className": "two-row-products",
      "id": null,
      "top": 2905.66,
      "width": 690,
      "height": 1379.98
    },
    {
      "index": 10,
      "tag": "section",
      "className": "das-with-banners",
      "id": null,
      "top": 4325.63,
      "width": 690,
      "height": 270.56
    }
  ]
}
```
