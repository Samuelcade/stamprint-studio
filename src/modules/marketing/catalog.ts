import womanStudio from "../../../assets/marketing/326ea51c-0efa-47b6-9cf0-433e1d5a0178.png?url";
import pair from "../../../assets/marketing/8ff90b6c-6e81-43ff-afe3-2577243af19e.png?url";
import womanCasual from "../../../assets/marketing/9367442c-abb5-4e62-95c4-8c653db41fbc.png?url";
import hanger from "../../../assets/marketing/a0e2c3d4-137d-4212-bf57-1c7d35e921be.png?url";
import man from "../../../assets/marketing/b4de22f2-189f-45b7-b930-7a1f72a89571.png?url";
export interface PhotoTemplate {
  id: string; title: string; source: string; width: number; height: number;
  crop?: { x: number; y: number; width: number; height: number };
  maskPath?: string; lightOnDark?: boolean;
  print: { x: number; y: number; width: number };
}
// Source photographs are bundled unchanged. Masks and crops use original-photo coordinates.
export const PHOTO_TEMPLATES: PhotoTemplate[] = [
  { id: "photo-hanger", title: "Camiseta en percha", source: hanger, width: 900, height: 1198,
    maskPath: "M340 222 Q372 245 402 249 Q485 261 544 222 L570 234 Q630 253 687 285 Q724 322 746 368 L877 648 Q806 698 724 731 L698 685 L710 1073 Q700 1081 450 1080 Q199 1080 195 1074 L204 705 Q191 734 177 741 Q99 710 29 647 L187 328 Q201 294 237 276 Q290 246 340 222 Z", print: { x: .50, y: .49, width: .31 } },
  { id: "photo-woman-casual", title: "Modelo · camiseta casual", source: womanCasual, width: 400, height: 500,
    maskPath: "M155 66 Q163 89 203 93 Q239 96 257 66 Q300 77 330 96 Q349 114 358 156 Q365 193 377 229 Q350 241 313 246 L307 221 Q306 251 314 274 Q320 286 314 301 L318 316 L310 331 Q289 327 272 339 L247 356 Q239 363 245 371 Q251 375 274 359 L279 374 Q268 392 244 407 Q181 446 95 446 L72 442 Q70 436 73 426 Q80 385 85 352 Q95 300 101 247 Q71 245 33 228 L54 157 Q61 122 77 105 Q92 85 125 80 Z", print: { x: .49, y: .41, width: .33 } },
  { id: "photo-man", title: "Modelo · camiseta masculina", source: man, width: 690, height: 1070,
    maskPath: "M296 233 Q303 268 334 277 Q388 290 423 238 Q468 254 504 276 Q534 301 549 343 L597 498 Q550 511 492 513 L478 474 Q476 553 484 602 L496 652 L490 686 L491 714 L485 730 Q455 760 405 770 Q320 789 253 768 Q223 750 209 730 L197 699 L206 682 Q199 672 204 651 L216 595 L216 488 Q174 489 128 477 L157 347 Q160 317 173 300 Q209 267 275 241 Z", print: { x: .51, y: .43, width: .31 } },
  { id: "photo-woman-studio", title: "Modelo · camiseta de estudio", source: womanStudio, width: 1128, height: 2000,
    maskPath: "M438 556 Q542 599 690 509 Q714 532 761 535 Q854 539 890 546 Q949 606 974 690 L1010 774 L1000 792 Q967 802 948 821 Q905 858 872 866 L860 831 Q876 866 880 908 L870 1018 L866 1187 Q857 1251 879 1341 Q855 1387 804 1411 L764 1427 L696 1468 Q648 1458 581 1459 Q402 1455 276 1404 L288 1347 Q286 1312 298 1282 Q298 1250 328 1223 L328 1110 Q327 1040 311 1009 Q294 956 303 924 Q229 908 165 891 L218 719 Q227 681 245 662 Q332 618 395 597 Z", print: { x: .53, y: .49, width: .34 } },
  { id: "photo-shirt-front", title: "Camiseta · frente", source: pair, width: 1152, height: 2048, crop: { x: 30, y: 120, width: 800, height: 855 }, lightOnDark: true, print: { x: .50, y: .39, width: .34 } },
  { id: "photo-shirt-back", title: "Camiseta · espalda", source: pair, width: 1152, height: 2048, crop: { x: 360, y: 1080, width: 770, height: 830 }, lightOnDark: true, print: { x: .50, y: .36, width: .35 } },
];
export const photoTemplate = (id: string) => PHOTO_TEMPLATES.find(template => template.id === id);
