/**
 * @aparte/plugin-cards/order — an order or a booking, drawn as its receipt.
 *
 *   import { setupOrderCard } from '@aparte/plugin-cards/order';
 *
 *   setupOrderCard({ tool: 'get_order', variant: 'receipt' });
 *
 * The summary every messaging platform settled on for a purchase or a reservation: what
 * was bought (or booked), what it cost, where it stands, and where it is going. Three
 * variants of one card: `receipt` (the whole record — lines, totals, payment, delivery,
 * address), `compact` (one row, for a list of past orders) and `confirmation` (the moment
 * it is placed — a seal, a headline, the few facts that matter, the next step).
 *
 * Your tool keeps its own fields: `readOrder` already reads the usual spellings — a
 * Shopify or WooCommerce order (`line_items`, `order_number`, `financial_status`,
 * `shipping_address`), a Stripe Checkout session (`amount_total`, `total_details`; its
 * amounts are in cents, so say `minorUnits: true` — the card does not guess) — and `map`
 * covers the rest.
 */
import type { AparteConfig } from '@aparte/core';
import { defineCard, type CardContext, type CardSetupOptions } from '../kit/define.js';
import { el, glyph, num, str, webUrl } from '../kit/dom.js';
import { currencyCode, formatNumber, formatPrice, readPriceText, toDate } from '../kit/format.js';
import { intlTag, word, type CardWord } from '../kit/strings.js';
import { ARROW, BAG, BOX, CALENDAR, CARD, CHEVRON, HOUSE, INFO, PEOPLE, PERSON, PIN, TRUCK, seal, type SealTone } from './icons.js';
import orderStyles from './order.css?raw';

export type OrderVariant = 'receipt' | 'compact' | 'confirmation';
export type OrderKind = 'order' | 'booking';

/** Where an order or a booking stands; anything else a tool writes is shown as it wrote it. */
export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'failed';

/** A moment a tool gave: an ISO string, an epoch, a `Date`. */
export type OrderDateInput = string | number | Date;

/** One line as `map` returns it. Only `title` is needed. */
export interface OrderLineInput {
    title: string;
    /** The variant: "Blue · M". */
    subtitle?: string;
    /** An `http(s)` URL, or `{ src, alt }`. */
    image?: string | { src: string; alt?: string };
    /** 1 when missing. 0 is kept — a line no longer bought — and left out of the subtotal. */
    quantity?: number;
    /** The unit price: `12`, `"12.00"`, `"12,00 €"`. */
    price?: number | string;
    /** The line's total, before the order's discount; `quantity × price` when missing. */
    total?: number | string;
}

/** What `map` returns. Every field adds a part when it is there and nothing when it is not. */
export interface OrderInput {
    /** `order` by default. */
    kind?: OrderKind;
    title?: string;
    /**
     * The `confirmation` variant's headline, when the status's own sentence ("Order being
     * prepared") is not what happened: "Return started", "Exchange requested".
     */
    headline?: string;
    /** The order or booking number. */
    reference?: string | number;
    status?: OrderStatus | string;
    /**
     * When it was placed. For a booking with no start of its own, it is the booking's day —
     * with a `time` beside it (`'19:30'`) when the tool gives one apart.
     */
    date?: OrderDateInput;
    items?: OrderLineInput[];
    /** An ISO 4217 code (`EUR`) or a usual symbol (`€`). */
    currency?: string;
    /** Summed from the lines when missing (and every line has a total). */
    subtotal?: number | string;
    /** Shown taken off: `10` reads "−€10.00". */
    discount?: number | string;
    /** `0` reads "Free". */
    shipping?: number | string;
    tax?: number | string;
    /** Computed when missing: subtotal − discount + shipping + tax. A tool's own total always wins. */
    total?: number | string;
    /** "Visa •••• 4242", or `{ brand, last4 }`. */
    payment?: string | { brand?: string; last4?: string };
    /** Several lines; `\n` keeps them apart. Or `{ name, email }`. */
    customer?: string | Record<string, unknown>;
    /** Several lines, or an address object (`address1`, `city`, `zip`, `country`…). */
    shippingAddress?: string | Record<string, unknown>;
    delivery?: {
        /** A date, a range `{ from, to }`, or words ("2–4 business days"). */
        estimate?: OrderDateInput | { from: OrderDateInput; to?: OrderDateInput };
        carrier?: string;
        trackingNumber?: string;
        /** `http(s)` only: the "Track" button opens it. */
        trackingUrl?: string;
    };
    /** Rows of your own: `{ label: 'Room', value: 'Deluxe' }`. */
    facts?: Array<{ label: string; value: string | number }>;
    /** For `kind: 'booking'`. */
    booking?: {
        start?: OrderDateInput;
        end?: OrderDateInput;
        location?: string;
        guests?: number;
    };
    /** The order's page; `http(s)` only. */
    url?: string;
    /** Every amount is in the currency's minor unit (Stripe's cents): divided before it is shown. */
    minorUnits?: boolean;
}

/** A moment, and whether it carries a time — a hotel's "2026-11-07" is a day, not midnight. */
export interface OrderWhen {
    date: Date;
    allDay: boolean;
}

export interface OrderLine {
    title: string;
    subtitle?: string;
    image?: { src: string; alt?: string };
    quantity: number;
    price?: number;
    total?: number;
}

export interface OrderFact {
    label: string;
    value: string;
}

/** The data as the card draws it, once read. */
export interface OrderData {
    kind: OrderKind;
    title?: string;
    headline?: string;
    reference?: string;
    status?: { status: OrderStatus } | { text: string };
    date?: Date;
    /** At most fifty; `lineCount` says how many the tool gave. */
    items: OrderLine[];
    lineCount: number;
    /** The quantities added up — "3 items" for one line of two and one of one. */
    itemCount: number;
    currency?: string;
    subtotal?: number;
    /** Positive: what was taken off. */
    discount?: number;
    shipping?: number;
    tax?: number;
    total?: number;
    payment?: string;
    customer?: string;
    shippingAddress?: string;
    delivery?: {
        estimate?: { from: OrderWhen; to?: OrderWhen } | { text: string };
        carrier?: string;
        trackingNumber?: string;
        trackingUrl?: string;
    };
    facts: OrderFact[];
    booking?: {
        start?: OrderWhen;
        end?: OrderWhen;
        location?: string;
        guests?: number;
    };
    url?: string;
}

const P = {
    cardsOrderOrder: { en: 'Order', fr: 'Commande', de: 'Bestellung', es: 'Pedido', it: 'Ordine', ja: '注文', ko: '주문', pt: 'Pedido', ru: 'Заказ', zh: '订单' },
    cardsOrderBooking: { en: 'Booking', fr: 'Réservation', de: 'Buchung', es: 'Reserva', it: 'Prenotazione', ja: '予約', ko: '예약', pt: 'Reserva', ru: 'Бронирование', zh: '预订' },
    cardsOrderNumbered: { en: 'Order {reference}', fr: 'Commande {reference}', de: 'Bestellung {reference}', es: 'Pedido {reference}', it: 'Ordine {reference}', ja: '注文 {reference}', ko: '주문 {reference}', pt: 'Pedido {reference}', ru: 'Заказ {reference}', zh: '订单 {reference}' },
    cardsOrderBookingNumbered: { en: 'Booking {reference}', fr: 'Réservation {reference}', de: 'Buchung {reference}', es: 'Reserva {reference}', it: 'Prenotazione {reference}', ja: '予約 {reference}', ko: '예약 {reference}', pt: 'Reserva {reference}', ru: 'Бронирование {reference}', zh: '预订 {reference}' },

    cardsOrderStatus_pending: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente', it: 'In attesa', ja: '保留中', ko: '대기 중', pt: 'Pendente', ru: 'Ожидает', zh: '待处理' },
    cardsOrderStatus_confirmed: { en: 'Confirmed', fr: 'Confirmée', de: 'Bestätigt', es: 'Confirmado', it: 'Confermato', ja: '確定済み', ko: '확인됨', pt: 'Confirmado', ru: 'Подтверждён', zh: '已确认' },
    cardsOrderStatus_processing: { en: 'Processing', fr: 'En préparation', de: 'In Bearbeitung', es: 'En preparación', it: 'In preparazione', ja: '準備中', ko: '처리 중', pt: 'Em preparação', ru: 'В обработке', zh: '处理中' },
    cardsOrderStatus_shipped: { en: 'Shipped', fr: 'Expédiée', de: 'Versandt', es: 'Enviado', it: 'Spedito', ja: '発送済み', ko: '배송 중', pt: 'Enviado', ru: 'Отправлен', zh: '已发货' },
    cardsOrderStatus_delivered: { en: 'Delivered', fr: 'Livrée', de: 'Zugestellt', es: 'Entregado', it: 'Consegnato', ja: '配達済み', ko: '배송 완료', pt: 'Entregue', ru: 'Доставлен', zh: '已送达' },
    cardsOrderStatus_cancelled: { en: 'Cancelled', fr: 'Annulée', de: 'Storniert', es: 'Cancelado', it: 'Annullato', ja: 'キャンセル済み', ko: '취소됨', pt: 'Cancelado', ru: 'Отменён', zh: '已取消' },
    cardsOrderStatus_refunded: { en: 'Refunded', fr: 'Remboursée', de: 'Erstattet', es: 'Reembolsado', it: 'Rimborsato', ja: '返金済み', ko: '환불됨', pt: 'Reembolsado', ru: 'Деньги возвращены', zh: '已退款' },
    cardsOrderStatus_failed: { en: 'Failed', fr: 'Échouée', de: 'Fehlgeschlagen', es: 'Fallido', it: 'Non riuscito', ja: '失敗', ko: '실패', pt: 'Falhou', ru: 'Не выполнен', zh: '失败' },

    // A booking is feminine where an order is masculine (es, it, pt) and neuter in Russian:
    // the words that agree with it are its own.
    cardsOrderBookingStatus_pending: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente', it: 'In attesa', ja: '保留中', ko: '대기 중', pt: 'Pendente', ru: 'Ожидает', zh: '待确认' },
    cardsOrderBookingStatus_confirmed: { en: 'Confirmed', fr: 'Confirmée', de: 'Bestätigt', es: 'Confirmada', it: 'Confermata', ja: '確定済み', ko: '확정됨', pt: 'Confirmada', ru: 'Подтверждено', zh: '已确认' },
    cardsOrderBookingStatus_cancelled: { en: 'Cancelled', fr: 'Annulée', de: 'Storniert', es: 'Cancelada', it: 'Annullata', ja: 'キャンセル済み', ko: '취소됨', pt: 'Cancelada', ru: 'Отменено', zh: '已取消' },
    cardsOrderBookingStatus_refunded: { en: 'Refunded', fr: 'Remboursée', de: 'Erstattet', es: 'Reembolsada', it: 'Rimborsata', ja: '返金済み', ko: '환불됨', pt: 'Reembolsada', ru: 'Деньги возвращены', zh: '已退款' },
    cardsOrderBookingStatus_failed: { en: 'Failed', fr: 'Échouée', de: 'Fehlgeschlagen', es: 'Fallida', it: 'Non riuscita', ja: '失敗', ko: '실패', pt: 'Falhou', ru: 'Не выполнено', zh: '失败' },

    cardsOrderHeadline_pending: { en: 'Order placed', fr: 'Commande passée', de: 'Bestellung aufgegeben', es: 'Pedido realizado', it: 'Ordine effettuato', ja: 'ご注文を受け付けました', ko: '주문이 접수되었습니다', pt: 'Pedido realizado', ru: 'Заказ оформлен', zh: '订单已提交' },
    cardsOrderHeadline_confirmed: { en: 'Order confirmed', fr: 'Commande confirmée', de: 'Bestellung bestätigt', es: 'Pedido confirmado', it: 'Ordine confermato', ja: 'ご注文が確定しました', ko: '주문이 확인되었습니다', pt: 'Pedido confirmado', ru: 'Заказ подтверждён', zh: '订单已确认' },
    cardsOrderHeadline_processing: { en: 'Order being prepared', fr: 'Commande en préparation', de: 'Bestellung wird bearbeitet', es: 'Pedido en preparación', it: 'Ordine in preparazione', ja: 'ご注文を準備中です', ko: '주문을 준비 중입니다', pt: 'Pedido em preparação', ru: 'Заказ собирается', zh: '订单处理中' },
    cardsOrderHeadline_shipped: { en: 'Order shipped', fr: 'Commande expédiée', de: 'Bestellung versandt', es: 'Pedido enviado', it: 'Ordine spedito', ja: 'ご注文を発送しました', ko: '주문이 발송되었습니다', pt: 'Pedido enviado', ru: 'Заказ отправлен', zh: '订单已发货' },
    cardsOrderHeadline_delivered: { en: 'Order delivered', fr: 'Commande livrée', de: 'Bestellung zugestellt', es: 'Pedido entregado', it: 'Ordine consegnato', ja: 'ご注文が配達されました', ko: '주문이 배송 완료되었습니다', pt: 'Pedido entregue', ru: 'Заказ доставлен', zh: '订单已送达' },
    cardsOrderHeadline_cancelled: { en: 'Order cancelled', fr: 'Commande annulée', de: 'Bestellung storniert', es: 'Pedido cancelado', it: 'Ordine annullato', ja: 'ご注文はキャンセルされました', ko: '주문이 취소되었습니다', pt: 'Pedido cancelado', ru: 'Заказ отменён', zh: '订单已取消' },
    cardsOrderHeadline_refunded: { en: 'Order refunded', fr: 'Commande remboursée', de: 'Bestellung erstattet', es: 'Pedido reembolsado', it: 'Ordine rimborsato', ja: 'ご注文は返金されました', ko: '주문이 환불되었습니다', pt: 'Pedido reembolsado', ru: 'Деньги за заказ возвращены', zh: '订单已退款' },
    cardsOrderHeadline_failed: { en: 'Order failed', fr: 'Échec de la commande', de: 'Bestellung fehlgeschlagen', es: 'Error en el pedido', it: 'Ordine non riuscito', ja: 'ご注文を完了できませんでした', ko: '주문에 실패했습니다', pt: 'Falha no pedido', ru: 'Не удалось оформить заказ', zh: '订单失败' },

    cardsOrderBookingHeadline_pending: { en: 'Booking requested', fr: 'Réservation demandée', de: 'Buchung angefragt', es: 'Reserva solicitada', it: 'Prenotazione richiesta', ja: '予約をリクエストしました', ko: '예약이 요청되었습니다', pt: 'Reserva solicitada', ru: 'Запрос на бронирование отправлен', zh: '预订已提交' },
    cardsOrderBookingHeadline_confirmed: { en: 'Booking confirmed', fr: 'Réservation confirmée', de: 'Buchung bestätigt', es: 'Reserva confirmada', it: 'Prenotazione confermata', ja: '予約が確定しました', ko: '예약이 확정되었습니다', pt: 'Reserva confirmada', ru: 'Бронирование подтверждено', zh: '预订已确认' },
    cardsOrderBookingHeadline_cancelled: { en: 'Booking cancelled', fr: 'Réservation annulée', de: 'Buchung storniert', es: 'Reserva cancelada', it: 'Prenotazione annullata', ja: '予約はキャンセルされました', ko: '예약이 취소되었습니다', pt: 'Reserva cancelada', ru: 'Бронирование отменено', zh: '预订已取消' },
    cardsOrderBookingHeadline_refunded: { en: 'Booking refunded', fr: 'Réservation remboursée', de: 'Buchung erstattet', es: 'Reserva reembolsada', it: 'Prenotazione rimborsata', ja: '予約は返金されました', ko: '예약이 환불되었습니다', pt: 'Reserva reembolsada', ru: 'Деньги за бронирование возвращены', zh: '预订已退款' },
    cardsOrderBookingHeadline_failed: { en: 'Booking failed', fr: 'Échec de la réservation', de: 'Buchung fehlgeschlagen', es: 'Error en la reserva', it: 'Prenotazione non riuscita', ja: '予約を完了できませんでした', ko: '예약에 실패했습니다', pt: 'Falha na reserva', ru: 'Не удалось забронировать', zh: '预订失败' },

    cardsOrderPlaced: { en: 'Placed {date}', fr: 'Passée le {date}', de: 'Bestellt am {date}', es: 'Realizado el {date}', it: 'Effettuato il {date}', ja: '注文日 {date}', ko: '주문일 {date}', pt: 'Feito em {date}', ru: 'Оформлен {date}', zh: '下单于 {date}' },
    cardsOrderBooked: { en: 'Booked {date}', fr: 'Réservée le {date}', de: 'Gebucht am {date}', es: 'Reservada el {date}', it: 'Prenotata il {date}', ja: '予約日 {date}', ko: '예약일 {date}', pt: 'Reservada em {date}', ru: 'Забронировано {date}', zh: '预订于 {date}' },
    cardsOrderItem: { en: '{n} item', fr: '{n} article', de: '{n} Artikel', es: '{n} artículo', it: '{n} articolo', ja: '{n}点', ko: '상품 {n}개', pt: '{n} item', ru: '{n} товар', zh: '{n} 件商品' },
    cardsOrderItems: { en: '{n} items', fr: '{n} articles', de: '{n} Artikel', es: '{n} artículos', it: '{n} articoli', ja: '{n}点', ko: '상품 {n}개', pt: '{n} itens', ru: 'Товаров: {n}', zh: '{n} 件商品' },
    cardsOrderLines: { en: 'Items', fr: 'Articles', de: 'Artikel', es: 'Artículos', it: 'Articoli', ja: '商品', ko: '상품', pt: 'Itens', ru: 'Товары', zh: '商品' },
    cardsOrderMore: { en: 'and {n} more', fr: 'et {n} de plus', de: 'und {n} weitere', es: 'y {n} más', it: 'e altri {n}', ja: 'ほか{n}件', ko: '외 {n}개', pt: 'e mais {n}', ru: 'и ещё {n}', zh: '还有 {n} 件' },
    cardsOrderEach: { en: '{price} each', fr: '{price} l’unité', de: 'je {price}', es: '{price} c/u', it: '{price} cad.', ja: '単価 {price}', ko: '개당 {price}', pt: '{price} cada', ru: '{price} за шт.', zh: '单价 {price}' },

    cardsOrderSubtotal: { en: 'Subtotal', fr: 'Sous-total', de: 'Zwischensumme', es: 'Subtotal', it: 'Subtotale', ja: '小計', ko: '소계', pt: 'Subtotal', ru: 'Подытог', zh: '小计' },
    cardsOrderDiscount: { en: 'Discount', fr: 'Remise', de: 'Rabatt', es: 'Descuento', it: 'Sconto', ja: '割引', ko: '할인', pt: 'Desconto', ru: 'Скидка', zh: '折扣' },
    cardsOrderShipping: { en: 'Shipping', fr: 'Livraison', de: 'Versand', es: 'Envío', it: 'Spedizione', ja: '送料', ko: '배송비', pt: 'Frete', ru: 'Доставка', zh: '运费' },
    cardsOrderFree: { en: 'Free', fr: 'Gratuite', de: 'Kostenlos', es: 'Gratis', it: 'Gratuita', ja: '無料', ko: '무료', pt: 'Grátis', ru: 'Бесплатно', zh: '免费' },
    cardsOrderTax: { en: 'Tax', fr: 'Taxes', de: 'Steuern', es: 'Impuestos', it: 'Imposte', ja: '税', ko: '세금', pt: 'Impostos', ru: 'Налог', zh: '税费' },
    cardsOrderTotal: { en: 'Total', fr: 'Total', de: 'Gesamt', es: 'Total', it: 'Totale', ja: '合計', ko: '합계', pt: 'Total', ru: 'Итого', zh: '合计' },
    cardsOrderFallbackTotal: { en: 'total {amount}', fr: 'total {amount}', de: 'gesamt {amount}', es: 'total {amount}', it: 'totale {amount}', ja: '合計 {amount}', ko: '합계 {amount}', pt: 'total {amount}', ru: 'итого {amount}', zh: '合计 {amount}' },

    cardsOrderPayment: { en: 'Payment', fr: 'Paiement', de: 'Zahlung', es: 'Pago', it: 'Pagamento', ja: 'お支払い', ko: '결제', pt: 'Pagamento', ru: 'Оплата', zh: '付款方式' },
    cardsOrderDelivery: { en: 'Estimated delivery', fr: 'Livraison prévue', de: 'Voraussichtliche Lieferung', es: 'Entrega estimada', it: 'Consegna prevista', ja: 'お届け予定', ko: '도착 예정', pt: 'Entrega prevista', ru: 'Ожидаемая доставка', zh: '预计送达' },
    cardsOrderTrack: { en: 'Track', fr: 'Suivre', de: 'Verfolgen', es: 'Seguir', it: 'Traccia', ja: '追跡', ko: '배송 조회', pt: 'Rastrear', ru: 'Отследить', zh: '查看物流' },
    cardsOrderAddress: { en: 'Delivery address', fr: 'Adresse de livraison', de: 'Lieferadresse', es: 'Dirección de entrega', it: 'Indirizzo di consegna', ja: 'お届け先', ko: '배송지', pt: 'Endereço de entrega', ru: 'Адрес доставки', zh: '收货地址' },
    cardsOrderCustomer: { en: 'Customer', fr: 'Client', de: 'Kunde', es: 'Cliente', it: 'Cliente', ja: 'お客様', ko: '고객', pt: 'Cliente', ru: 'Покупатель', zh: '客户' },
    cardsOrderView: { en: 'View order', fr: 'Voir la commande', de: 'Bestellung ansehen', es: 'Ver pedido', it: 'Vedi ordine', ja: '注文を見る', ko: '주문 보기', pt: 'Ver pedido', ru: 'Открыть заказ', zh: '查看订单' },
    cardsOrderViewBooking: { en: 'View booking', fr: 'Voir la réservation', de: 'Buchung ansehen', es: 'Ver reserva', it: 'Vedi prenotazione', ja: '予約を見る', ko: '예약 보기', pt: 'Ver reserva', ru: 'Открыть бронирование', zh: '查看预订' },

    cardsOrderWhen: { en: 'When', fr: 'Quand', de: 'Wann', es: 'Cuándo', it: 'Quando', ja: '日時', ko: '일시', pt: 'Quando', ru: 'Когда', zh: '时间' },
    cardsOrderWhere: { en: 'Where', fr: 'Où', de: 'Wo', es: 'Dónde', it: 'Dove', ja: '場所', ko: '장소', pt: 'Onde', ru: 'Где', zh: '地点' },
    cardsOrderGuestsLabel: { en: 'Guests', fr: 'Personnes', de: 'Gäste', es: 'Personas', it: 'Ospiti', ja: '人数', ko: '인원', pt: 'Pessoas', ru: 'Гости', zh: '人数' },
    cardsOrderStart: { en: 'Start', fr: 'Début', de: 'Beginn', es: 'Inicio', it: 'Inizio', ja: '開始', ko: '시작', pt: 'Início', ru: 'Начало', zh: '开始' },
    cardsOrderEnd: { en: 'End', fr: 'Fin', de: 'Ende', es: 'Fin', it: 'Fine', ja: '終了', ko: '종료', pt: 'Fim', ru: 'Конец', zh: '结束' },
    cardsOrderNight: { en: '{n} night', fr: '{n} nuit', de: '{n} Nacht', es: '{n} noche', it: '{n} notte', ja: '{n}泊', ko: '{n}박', pt: '{n} noite', ru: '{n} ночь', zh: '{n} 晚' },
    cardsOrderNights: { en: '{n} nights', fr: '{n} nuits', de: '{n} Nächte', es: '{n} noches', it: '{n} notti', ja: '{n}泊', ko: '{n}박', pt: '{n} noites', ru: 'Ночей: {n}', zh: '{n} 晚' },
    cardsOrderGuest: { en: '{n} guest', fr: '{n} personne', de: '{n} Gast', es: '{n} persona', it: '{n} ospite', ja: '{n}名', ko: '{n}명', pt: '{n} pessoa', ru: '{n} гость', zh: '{n} 位' },
    cardsOrderGuests: { en: '{n} guests', fr: '{n} personnes', de: '{n} Gäste', es: '{n} personas', it: '{n} ospiti', ja: '{n}名', ko: '{n}명', pt: '{n} pessoas', ru: 'Гостей: {n}', zh: '{n} 位' },
} satisfies Record<string, CardWord>;

type WordKey = keyof typeof P;

/** What a status means as a badge's intent. Every pill also carries its word. */
const INTENT: Record<OrderStatus, string> = {
    pending: 'warning',
    confirmed: 'success',
    processing: 'info',
    shipped: 'info',
    delivered: 'success',
    cancelled: 'neutral',
    refunded: 'neutral',
    failed: 'danger',
};

/** The confirmation's seal: a check for what went through, a clock for what waits, a cross for what did not. */
const TONE: Record<OrderStatus, SealTone> = {
    pending: 'info',
    confirmed: 'success',
    processing: 'info',
    shipped: 'success',
    delivered: 'success',
    cancelled: 'danger',
    refunded: 'neutral',
    failed: 'danger',
};

/** A booking is not shipped: what is under way reads as requested, what arrived as confirmed. */
const BOOKING_HEADLINE: Partial<Record<OrderStatus, OrderStatus>> = { processing: 'pending', shipped: 'confirmed', delivered: 'confirmed' };

/** Fifty: past that a receipt is an export. Six show; the rest are one click away. */
const LINES_KEPT = 50;
const LINES_SHOWN = 6;
const FACTS_KEPT = 12;
/** The confirmation keeps to what matters at that moment: the tool's first two facts. */
const FACTS_IN_CONFIRMATION = 2;

// ── Reading ──────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw => !!value && typeof value === 'object' && !Array.isArray(value);
const notNull = <T>(value: T | null | undefined | false): value is T => value !== null && value !== undefined && value !== false;

/** The first of `keys` that `r` has a value for. */
function pick(r: unknown, keys: readonly string[]): unknown {
    if (!isObject(r)) return undefined;
    for (const key of keys) if (r[key] !== undefined && r[key] !== null && r[key] !== '') return r[key];
    return undefined;
}

/** Letters only, lower case: `on-hold`, `On Hold` and `ON_HOLD` are one key. */
const squeeze = (value: unknown) => (typeof value === 'string' ? value.toLowerCase().replace(/[^a-z]/g, '') : '');

/** A Stripe object id (`cus_…`, `pm_…`) is a key into Stripe, not words to show. */
const isStripeId = (value: string) => /^(?:cus|pm|card|src|pi|ch|cs|in)_[A-Za-z0-9]{6,}$/.test(value);

/** An amount and the currency it was written in, from a number, a shop's text or `{ amount, currency }`. */
function moneyOf(value: unknown, divisor: number): { amount?: number; currency?: string } {
    if (typeof value === 'number') return Number.isFinite(value) ? { amount: value / divisor } : {};
    if (typeof value === 'string') {
        const { amount, currency } = readPriceText(value);
        return { ...(amount !== undefined ? { amount: amount / divisor } : {}), ...(currency ? { currency } : {}) };
    }
    if (isObject(value)) {
        // `{ amount, currency }`, Stripe's `{ unit_amount }`, Shopify's `{ shop_money: { amount } }`.
        const inner = moneyOf(pick(value, ['amount', 'value', 'unit_amount', 'cents', 'shop_money', 'shopMoney', 'price']), divisor);
        const currency = currencyCode(pick(value, ['currency', 'currency_code', 'currencyCode'])) ?? inner.currency;
        return { ...(inner.amount !== undefined ? { amount: inner.amount } : {}), ...(currency ? { currency } : {}) };
    }
    return {};
}

/** How much one unit of the currency is in its minor unit: 100 for the euro, 1 for the yen. */
function minorDivisor(currency: string | undefined): number {
    if (!currency) return 100;
    try {
        const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
        return 10 ** digits;
    } catch {
        return 100;
    }
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}/;

/**
 * A moment from what a tool wrote — or `undefined`. Strict on purpose: `new Date('Nov 7')`
 * reads 2001 in V8, so a string is a date only when it is ISO. A bare day (`2026-11-07`)
 * is that day in the reader's calendar, not midnight in London, and carries no time.
 */
export function readWhen(value: unknown): OrderWhen | undefined {
    if (typeof value === 'string') {
        const v = value.trim();
        const day = DATE_ONLY.exec(v);
        if (day) {
            const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
            // `2026-13-45` would roll over into 2027: a day that does not exist is no day.
            return date.getMonth() === Number(day[2]) - 1 && date.getDate() === Number(day[3]) ? { date, allDay: true } : undefined;
        }
        if (!DATE_TIME.test(v)) return undefined;
        const date = toDate(v.replace(' ', 'T'));
        return date ? { date, allDay: false } : undefined;
    }
    if (typeof value === 'number' || value instanceof Date) {
        const date = toDate(value);
        if (!date) return undefined;
        // A `Date` at midnight sharp is a day someone picked, not a dinner at 00:00.
        return { date, allDay: date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 };
    }
    return undefined;
}

/** `2026-11-07T00:00:00Z`, `…T00:00:00.000+00:00`: midnight in London, to the second. */
const MIDNIGHT_UTC = /^(\d{4}-\d{2}-\d{2})T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)$/i;

/**
 * A day a booking or a delivery falls on. A server that keeps days as timestamps writes
 * `2026-11-07` as midnight UTC, which is the evening of the 6th anywhere west of London: a
 * stamp at exactly midnight UTC is that day, read as a day. Any other moment is as `readWhen` reads it.
 */
function readDay(value: unknown): OrderWhen | undefined {
    const day = typeof value === 'string' ? MIDNIGHT_UTC.exec(value.trim()) : null;
    return readWhen(day ? day[1] : value);
}

/** `19:30`, `7:30 PM`, `07:30:00` — a time of day with no date. */
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s?m\.?)?$/i;

/** A day and a time a tool gave apart (`date: '2026-11-07', time: '19:30'`), as one moment. */
function dayAndTime(r: Raw): OrderWhen | undefined {
    const day = readDay(r['date']);
    const time = typeof r['time'] === 'string' ? TIME_OF_DAY.exec(r['time'].trim()) : null;
    if (!day || !time || !day.allDay) return day;
    let hours = Number(time[1]);
    const minutes = Number(time[2]);
    const half = time[3]?.toLowerCase();
    if (half) hours = (hours % 12) + (half === 'p' ? 12 : 0);
    if (hours > 23 || minutes > 59) return day;
    const date = new Date(day.date);
    date.setHours(hours, minutes, 0, 0);
    return { date, allDay: false };
}

/** schema.org's, Shopify's, WooCommerce's and Stripe's words for a state, squeezed to letters. */
const STATUS_WORDS: Record<string, OrderStatus> = {
    pending: 'pending', onhold: 'pending', awaitingpayment: 'pending', unpaid: 'pending', open: 'pending',
    requested: 'pending', tentative: 'pending', placed: 'pending', orderpaymentdue: 'pending',
    confirmed: 'confirmed', paid: 'confirmed', booked: 'confirmed', reserved: 'confirmed', accepted: 'confirmed',
    // WooCommerce's `completed` is "fulfilled and complete": paid and done on the shop's side —
    // a download, a service, a parcel handed over or not. `delivered` would claim the parcel
    // arrived and `shipped` that there was one; `confirmed` claims neither, like Stripe's `complete`.
    complete: 'confirmed', completed: 'confirmed', succeeded: 'confirmed', approved: 'confirmed',
    processing: 'processing', preparing: 'processing', inprogress: 'processing', packed: 'processing', orderprocessing: 'processing',
    shipped: 'shipped', fulfilled: 'shipped', intransit: 'shipped', dispatched: 'shipped', outfordelivery: 'shipped', orderintransit: 'shipped',
    delivered: 'delivered', orderdelivered: 'delivered',
    cancelled: 'cancelled', canceled: 'cancelled', voided: 'cancelled', void: 'cancelled', expired: 'cancelled', ordercancelled: 'cancelled',
    refunded: 'refunded', orderreturned: 'refunded',
    failed: 'failed', declined: 'failed', paymentfailed: 'failed', rejected: 'failed', orderproblem: 'failed',
};

/**
 * Where it stands. The tool's own status first, as a known state or as its words; else what
 * a shop's two half-statuses say when they say it plainly — Shopify's `cancelled_at`, a
 * refund, a fulfilled order (shipped), a paid one (confirmed). A partial refund or a partial
 * fulfilment says nothing a pill could, so it draws none.
 */
function readStatus(r: Raw): OrderData['status'] {
    const own = pick(r, ['status', 'state', 'order_status', 'orderStatus', 'booking_status', 'bookingStatus']);
    if (typeof own === 'string' && own.trim()) {
        const key = squeeze(own.replace(/^https?:\/\/schema\.org\//, ''));
        const status = STATUS_WORDS[key];
        return status ? { status } : { text: own.trim() };
    }
    if (pick(r, ['cancelled_at', 'canceled_at', 'cancelledAt', 'canceledAt'])) return { status: 'cancelled' };
    const paid = squeeze(pick(r, ['financial_status', 'financialStatus', 'displayFinancialStatus']));
    const sent = squeeze(pick(r, ['fulfillment_status', 'fulfillmentStatus', 'displayFulfillmentStatus']));
    const stripe = squeeze(pick(r, ['payment_status', 'paymentStatus']));
    if (paid === 'refunded') return { status: 'refunded' };
    if (paid === 'voided') return { status: 'cancelled' };
    if (sent === 'delivered') return { status: 'delivered' };
    if (sent === 'fulfilled') return { status: 'shipped' };
    if (paid === 'paid' || stripe === 'paid') return { status: 'confirmed' };
    if (paid === 'pending' || stripe === 'unpaid') return { status: 'pending' };
    return undefined;
}

/** A list from an array, a Stripe list (`{ data }`) or a GraphQL connection (`{ nodes }`, `{ edges }`). */
function listOf(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) return value;
    if (!isObject(value)) return undefined;
    if (Array.isArray(value['data'])) return value['data'];
    if (Array.isArray(value['nodes'])) return value['nodes'];
    if (Array.isArray(value['edges'])) return value['edges'].map((e) => (isObject(e) ? e['node'] : undefined));
    return undefined;
}

function readImage(value: unknown): OrderLine['image'] {
    if (Array.isArray(value)) return value.length ? readImage(value[0]) : undefined;
    if (isObject(value)) {
        const src = webUrl(pick(value, ['src', 'url', 'href', 'thumbnail']));
        const alt = str(pick(value, ['alt', 'altText', 'alt_text']));
        return src ? { src, ...(alt ? { alt } : {}) } : undefined;
    }
    const src = webUrl(value);
    return src ? { src } : undefined;
}

function readSubtitle(r: Raw): string | undefined {
    const value = pick(r, ['subtitle', 'variant_title', 'variantTitle', 'variant', 'variation', 'options']);
    if (Array.isArray(value)) {
        const parts = value.map((v) => (isObject(v) ? str(pick(v, ['value', 'name', 'title'])) : str(v))).filter(notNull);
        return parts.length ? parts.join(' · ') : undefined;
    }
    return isObject(value) ? str(pick(value, ['title', 'name'])) : str(value);
}

function readLine(raw: unknown, read: (value: unknown) => number | undefined): OrderLine | null {
    if (typeof raw === 'string') return raw.trim() ? { title: raw.trim(), quantity: 1 } : null;
    if (!isObject(raw)) return null;
    const title = str(pick(raw, ['title', 'name', 'description', 'product_name', 'productName', 'label']));
    if (!title) return null;
    const qty = num(pick(raw, ['quantity', 'qty', 'count']));
    // 0 is a line the order no longer buys (removed, refunded, out of stock): shown as ×0, never as one.
    const quantity = qty !== undefined && qty >= 0 ? qty : 1;
    const price = read(pick(raw, ['unit_price', 'unitPrice', 'price', 'amount', 'unit_amount']));
    // The line before the order's discount when the tool gives it (WooCommerce's `subtotal`,
    // Stripe's `amount_subtotal`): its `total` is after the coupon, and the receipt's discount
    // row would then take the coupon off a second time.
    const given = read(pick(raw, ['subtotal', 'amount_subtotal', 'line_subtotal']))
        ?? read(pick(raw, ['total', 'total_price', 'totalPrice', 'amount_total', 'line_total', 'lineTotal']));
    const total = given ?? (price !== undefined ? price * quantity : undefined);
    const subtitle = readSubtitle(raw);
    const image = readImage(pick(raw, ['image', 'image_url', 'imageUrl', 'thumbnail', 'images', 'photo', 'picture']));
    return {
        title,
        ...(subtitle ? { subtitle } : {}),
        ...(image ? { image } : {}),
        quantity,
        ...(price !== undefined ? { price } : {}),
        ...(total !== undefined ? { total } : {}),
    };
}

/** "Visa •••• 4242" from `{ brand, last4 }` (or Stripe's `{ card: { … } }`), or the tool's own words. */
function readPayment(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        const parts = value.map(readPayment).filter(notNull);
        return parts.length ? parts.join(', ') : undefined;
    }
    if (isObject(value)) {
        const card = isObject(value['card']) ? value['card'] : value;
        const brand = str(pick(card, ['brand', 'network', 'type']));
        const last4 = str(pick(card, ['last4', 'last_4', 'lastFour', 'last_digits']));
        if (last4) return `${brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : ''} •••• ${last4}`.trim();
        return str(pick(value, ['label', 'title', 'description', 'name'])) ?? brand;
    }
    const text = str(value);
    return text && !isStripeId(text) ? text : undefined;
}

/** A person's name from `name`, or first and last. */
function nameOf(r: Raw): string | undefined {
    const name = str(pick(r, ['name', 'full_name', 'fullName']));
    if (name) return name;
    const parts = [pick(r, ['first_name', 'firstName', 'given_name']), pick(r, ['last_name', 'lastName', 'family_name'])].map(str).filter(notNull);
    return parts.length ? parts.join(' ') : undefined;
}

const ADDRESS_KEYS = ['address1', 'address_1', 'line1', 'street', 'street1', 'city', 'postal_code', 'postcode', 'zip'];

/** Countries that write "City, ST 12345" rather than "12345 City". */
const CITY_FIRST = new Set(['us', 'usa', 'unitedstates', 'ca', 'canada', 'au', 'australia', 'gb', 'uk', 'unitedkingdom']);

/** An address as lines: a string as written, or an object's parts in the usual order. */
function readAddress(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() ? value.trim().replace(/\s*\n\s*/g, '\n') : undefined;
    if (!isObject(value)) return undefined;
    // Stripe nests the address under the name: `{ name, address: { line1, … } }`.
    const inner = isObject(value['address']) ? value['address'] : value;
    const s = (keys: string[]) => str(pick(inner, keys));
    const city = s(['city', 'locality', 'town']);
    const postal = s(['zip', 'postal_code', 'postalCode', 'postcode']);
    const region = s(['province_code', 'state', 'province', 'region']);
    const country = s(['country', 'country_code', 'countryCode']);
    const cityFirst = CITY_FIRST.has(squeeze(country));
    const locality = cityFirst
        ? [[city, region].filter(notNull).join(', '), postal].filter((p) => p).join(' ')
        : [postal, city].filter(notNull).join(' ');
    const lines = [
        nameOf(value) ?? nameOf(inner),
        s(['company']),
        s(['address1', 'address_1', 'line1', 'street', 'street1']),
        s(['address2', 'address_2', 'line2', 'street2']),
        locality || undefined,
        country,
    ].filter(notNull);
    return lines.length ? lines.join('\n') : undefined;
}

/** The customer as a name and a way to reach them — never their whole billing address. */
function readCustomer(value: unknown): string | undefined {
    if (typeof value === 'string') return value.trim() && !isStripeId(value.trim()) ? value.trim() : undefined;
    if (!isObject(value)) return undefined;
    const lines = [nameOf(value), str(pick(value, ['email'])), str(pick(value, ['phone']))].filter(notNull);
    return lines.length ? lines.join('\n') : undefined;
}

function readFacts(value: unknown): OrderFact[] {
    const out: OrderFact[] = [];
    if (Array.isArray(value)) {
        for (const item of value) {
            const label = str(pick(item, ['label', 'name', 'key', 'title']));
            const fact = str(pick(item, ['value', 'text']));
            if (label && fact) out.push({ label, value: fact });
        }
    } else if (isObject(value)) {
        for (const [label, raw] of Object.entries(value)) {
            const fact = str(raw);
            if (label.trim() && fact) out.push({ label: label.trim(), value: fact });
        }
    }
    return out.slice(0, FACTS_KEPT);
}

function readEstimate(value: unknown): NonNullable<OrderData['delivery']>['estimate'] {
    if (Array.isArray(value)) value = { from: value[0], to: value[1] };
    // A Date is an object too: it is one day, not a range with no ends.
    if (isObject(value) && !(value instanceof Date)) {
        const from = readDay(pick(value, ['from', 'start', 'earliest', 'min']));
        const to = readDay(pick(value, ['to', 'end', 'latest', 'max']));
        if (from) return to && to.date > from.date ? { from, to } : { from };
        return to ? { from: to } : undefined;
    }
    const when = readDay(value);
    if (when) return { from: when };
    const text = str(value);
    return text ? { text } : undefined;
}

function readDelivery(r: Raw): OrderData['delivery'] {
    const fulfillments = listOf(r['fulfillments']);
    const nested = [r['delivery'], r['shipment'], r['fulfillment'], fulfillments?.[0], r['tracking']].find(isObject);
    const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);
    const estimate = readEstimate(
        pick(nested, ['estimate', 'estimatedDelivery', 'estimated_delivery', 'eta', 'expected', 'expectedDate', 'expected_date', 'date'])
        ?? pick(r, ['estimatedDelivery', 'estimated_delivery', 'deliveryEstimate', 'delivery_estimate', 'deliveryDate', 'delivery_date', 'eta'])
        ?? (typeof r['delivery'] === 'string' ? r['delivery'] : undefined),
    );
    const carrier = str(pick(nested, ['carrier', 'company', 'tracking_company', 'trackingCompany', 'service'])
        ?? pick(r, ['carrier', 'tracking_company', 'trackingCompany', 'shippingCarrier', 'shipping_carrier']));
    const trackingNumber = str(first(pick(nested, ['trackingNumber', 'tracking_number', 'tracking_numbers', 'number'])
        ?? pick(r, ['trackingNumber', 'tracking_number'])));
    const trackingUrl = webUrl(first(pick(nested, ['trackingUrl', 'tracking_url', 'tracking_urls', 'trackingLink', 'tracking_link', 'url'])
        ?? pick(r, ['trackingUrl', 'tracking_url', 'trackingLink', 'tracking_link'])));
    if (!estimate && !carrier && !trackingNumber && !trackingUrl) return undefined;
    return {
        ...(estimate ? { estimate } : {}),
        ...(carrier ? { carrier } : {}),
        ...(trackingNumber ? { trackingNumber } : {}),
        ...(trackingUrl ? { trackingUrl } : {}),
    };
}

const START_KEYS = ['start', 'startTime', 'start_time', 'startDate', 'start_date', 'checkIn', 'check_in', 'checkin', 'from', 'datetime', 'dateTime', 'time'];
const END_KEYS = ['end', 'endTime', 'end_time', 'endDate', 'end_date', 'checkOut', 'check_out', 'checkout', 'to', 'until'];

/**
 * The booking, and whether its start was the order's own `date` — which then is not also the
 * day it was placed: `{ kind: 'booking', date: '2026-11-07', time: '19:30' }` is a dinner on
 * the 7th, not a booking made that day with no when.
 */
function readBooking(r: Raw): { booking: OrderData['booking']; tookDate: boolean } {
    const b = [r['booking'], r['reservation']].find(isObject) ?? r;
    const own = readDay(pick(b, START_KEYS));
    const fromDate = own ? undefined : dayAndTime(b);
    const start = own ?? fromDate;
    const tookDate = fromDate !== undefined && b === r;
    const endRead = readDay(pick(b, END_KEYS));
    // An end before its start is a typo; the start alone is still true.
    const end = endRead && (!start || endRead.date >= start.date) ? endRead : undefined;
    const place = pick(b, ['location', 'venue', 'place', 'address', 'where']);
    const location = isObject(place)
        ? [str(pick(place, ['name', 'title'])), str(pick(place, ['address', 'formatted_address']))].filter(notNull).join(', ') || undefined
        : str(place);
    const people = pick(b, ['guests', 'partySize', 'party_size', 'people', 'persons', 'covers', 'attendees']);
    const count = Array.isArray(people) ? people.length : num(people);
    const guests = count !== undefined && count > 0 ? Math.floor(count) : undefined;
    if (!start && !location && guests === undefined) return { booking: undefined, tookDate };
    return {
        booking: {
            ...(start ? { start } : {}),
            ...(end ? { end } : {}),
            ...(location ? { location } : {}),
            ...(guests !== undefined ? { guests } : {}),
        },
        tookDate,
    };
}

function readKind(r: Raw): OrderKind {
    const said = squeeze(pick(r, ['kind', 'type', 'object']));
    if (['booking', 'reservation', 'appointment', 'lodgingreservation', 'foodestablishmentreservation', 'eventreservation'].includes(said)) return 'booking';
    if (['order', 'purchase', 'checkoutsession'].includes(said)) return 'order';
    if (isObject(r['booking']) || isObject(r['reservation'])) return 'booking';
    return pick(r, ['checkIn', 'check_in', 'startTime', 'start_time', 'startDate', 'start_date']) !== undefined ? 'booking' : 'order';
}

/**
 * The card's data from the loose shape `map` returns, or `null` when it has nothing to
 * draw — no line, no number, no total, no booking date, no title.
 */
export function readOrder(raw: unknown): OrderData | null {
    if (!isObject(raw)) return null;
    const r = raw;
    const kind = readKind(r);
    const minor = r['minorUnits'] === true || r['minor_units'] === true;

    let currency = currencyCode(pick(r, ['currency', 'currency_code', 'currencyCode', 'presentment_currency']));
    const divisor = minor ? minorDivisor(currency) : 1;
    // A currency written only in an amount (`"€12.00"`) is still the order's.
    const read = (value: unknown) => {
        const money = moneyOf(value, divisor);
        currency ??= money.currency;
        return money.amount;
    };
    /** The first of `keys` that holds an amount — WooCommerce's `shipping` is an address, its cost is `shipping_total`. */
    const amount = (from: unknown, keys: readonly string[]) => {
        if (!isObject(from)) return undefined;
        for (const key of keys) {
            const value = from[key] === undefined || from[key] === null ? undefined : read(from[key]);
            if (value !== undefined) return value;
        }
        return undefined;
    };

    const all = (['items', 'line_items', 'lineItems', 'products', 'lines'].map((key) => listOf(r[key])).find(notNull) ?? [])
        .map((line) => readLine(line, read))
        .filter(notNull);
    const items = all.slice(0, LINES_KEPT);

    const details = isObject(r['total_details']) ? r['total_details'] : undefined;
    const shippingLines = listOf(r['shipping_lines']);
    let subtotal = amount(r, ['subtotal', 'sub_total', 'subtotal_price', 'subtotalPrice', 'amount_subtotal', 'items_total', 'itemsTotal']);
    const discountRaw = amount(r, ['discount', 'total_discount', 'total_discounts', 'totalDiscounts', 'discount_total', 'discountTotal']) ?? amount(details, ['amount_discount']);
    let shipping = amount(r, ['shipping', 'shipping_total', 'shippingTotal', 'shipping_cost', 'shippingCost', 'shipping_price', 'shippingPrice', 'total_shipping', 'delivery_fee', 'deliveryFee'])
        ?? amount(details, ['amount_shipping']) ?? amount(r['shipping_cost'], ['amount_total']);
    if (shipping === undefined && shippingLines?.length) {
        const costs = shippingLines.map((l) => amount(l, ['price', 'amount'])).filter(notNull);
        if (costs.length) shipping = costs.reduce((a, b) => a + b, 0);
    }
    const tax = amount(r, ['tax', 'taxes', 'total_tax', 'totalTax', 'tax_total', 'taxTotal', 'vat']) ?? amount(details, ['amount_tax']);
    let total = amount(r, ['total', 'total_price', 'totalPrice', 'amount_total', 'amountTotal', 'grand_total', 'grandTotal', 'amount']);

    // Sums only from lines that all have one: a subtotal over half the lines would be a lie.
    // A line of quantity 0 is bought by no one, whatever total the tool left on it.
    const bought = all.filter((l) => l.quantity !== 0);
    if (subtotal === undefined && bought.length && bought.every((l) => l.total !== undefined)) {
        subtotal = bought.reduce((sum, l) => sum + l.total!, 0);
    }
    const discount = discountRaw !== undefined ? Math.abs(discountRaw) : undefined;
    if (total === undefined && subtotal !== undefined) total = subtotal - (discount ?? 0) + (shipping ?? 0) + (tax ?? 0);

    const reference = str(pick(r, [
        'reference', 'order_number', 'orderNumber', 'number', 'confirmation_number', 'confirmationNumber', 'confirmation_code',
        'confirmationCode', 'booking_reference', 'bookingReference', 'booking_id', 'bookingId', 'order_id', 'orderId', 'id',
    ]))?.replace(/^#\s*/, '') || undefined;
    const title = str(pick(r, ['title', 'heading']));
    const ownHeadline = str(r['headline']);
    const status = readStatus(r);
    const { booking, tookDate } = kind === 'booking' ? readBooking(r) : { booking: undefined, tookDate: false };
    const placedKeys = ['date', 'created_at', 'createdAt', 'placed_at', 'placedAt', 'order_date', 'orderDate', 'date_created', 'dateCreated', 'processed_at', 'created'];
    const date = readWhen(pick(r, tookDate ? placedKeys.slice(1) : placedKeys))?.date;
    const delivery = readDelivery(r);
    const payment = readPayment(pick(r, ['payment', 'paymentMethod', 'payment_method', 'payment_method_title', 'paymentMethodTitle', 'payment_method_details', 'card', 'payment_gateway_names']));
    const customer = readCustomer(pick(r, ['customer_details', 'customerDetails', 'customer', 'customer_name', 'customerName', 'buyer', 'contact']));
    const shippingAddress = kind === 'order'
        ? readAddress(pick(r, ['shippingAddress', 'shipping_address', 'shipping_details', 'shippingDetails', 'deliveryAddress', 'delivery_address', 'address'])
            ?? (isObject(r['shipping']) && ADDRESS_KEYS.some((k) => k in (r['shipping'] as Raw)) ? r['shipping'] : undefined))
        : undefined;
    const url = webUrl(pick(r, ['url', 'orderUrl', 'order_url', 'order_status_url', 'orderStatusUrl', 'statusUrl', 'status_url', 'receipt_url', 'receiptUrl', 'manageUrl', 'manage_url', 'link', 'href']));

    if (!items.length && !reference && total === undefined && !booking && !title) return null;

    const whole = all.every((l) => Number.isInteger(l.quantity));
    return {
        kind,
        ...(title ? { title } : {}),
        ...(ownHeadline ? { headline: ownHeadline } : {}),
        ...(reference ? { reference } : {}),
        ...(status ? { status } : {}),
        ...(date ? { date } : {}),
        items,
        lineCount: all.length,
        itemCount: whole ? all.reduce((n, l) => n + l.quantity, 0) : all.length,
        ...(currency ? { currency } : {}),
        ...(subtotal !== undefined ? { subtotal } : {}),
        ...(discount !== undefined ? { discount } : {}),
        ...(shipping !== undefined ? { shipping } : {}),
        ...(tax !== undefined ? { tax } : {}),
        ...(total !== undefined ? { total } : {}),
        ...(payment ? { payment } : {}),
        ...(customer ? { customer } : {}),
        ...(shippingAddress ? { shippingAddress } : {}),
        ...(delivery ? { delivery } : {}),
        facts: readFacts(pick(r, ['facts', 'details', 'extra', 'extras', 'note_attributes'])),
        ...(booking ? { booking } : {}),
        ...(url ? { url } : {}),
    };
}

// ── Words and numbers ────────────────────────────────────────────────────────

const say = (config: AparteConfig, key: WordKey, vars?: Record<string, string>) => word(config, key, P[key], vars);
const money = (config: AparteConfig, data: Pick<OrderData, 'currency'>, amount: number) => formatPrice(config, amount, data.currency);

/** "1 item" or "3 items", as the language counts. */
function counted(config: AparteConfig, one: WordKey, other: WordKey, n: number): string {
    const rule = new Intl.PluralRules(intlTag(config)).select(n);
    return say(config, rule === 'one' ? one : other, { n: formatNumber(config, n) });
}

/** A number written alone reads better with its sign: "Order #1042", but "Booking K7F2Q". */
const shownReference = (reference: string) => (/^\d+$/.test(reference) ? `#${reference}` : reference);

/** The card's name, as its header shows it. `hash` writes a bare number as "#1042". */
function headText(config: AparteConfig, data: Partial<OrderData> | null, hash: boolean): string {
    if (data?.title) return data.title;
    const booking = data?.kind === 'booking';
    if (data?.reference) {
        const reference = hash ? shownReference(data.reference) : data.reference;
        return say(config, booking ? 'cardsOrderBookingNumbered' : 'cardsOrderNumbered', { reference });
    }
    return say(config, booking ? 'cardsOrderBooking' : 'cardsOrderOrder');
}

function statusWord(config: AparteConfig, data: Pick<OrderData, 'kind' | 'status'>): string {
    const status = data.status;
    if (!status) return '';
    if ('text' in status) return status.text;
    const own = `cardsOrderBookingStatus_${status.status}`;
    const key = (data.kind === 'booking' && own in P ? own : `cardsOrderStatus_${status.status}`) as WordKey;
    return say(config, key);
}

/** The confirmation's headline: the status said as a sentence, or "confirmed" when it says nothing. */
function headline(config: AparteConfig, data: OrderData): string {
    if (data.headline) return data.headline;
    const status = data.status && 'status' in data.status ? data.status.status : 'confirmed';
    if (data.kind !== 'booking') return say(config, `cardsOrderHeadline_${status}` as WordKey);
    const own = BOOKING_HEADLINE[status] ?? status;
    return say(config, `cardsOrderBookingHeadline_${own}` as WordKey);
}

const dateFormat = (config: AparteConfig, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlTag(config), options);

/** "Oct 31, 2026": the day an order was placed. */
const placedOn = (config: AparteConfig, date: Date) => dateFormat(config, { dateStyle: 'medium' }).format(date);

/** The day's fields, with the year only when it is not this one. */
function dayOptions(date: Date, now = new Date()): Intl.DateTimeFormatOptions {
    return { weekday: 'short', day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) };
}

const TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/** Two moments as the language joins them, or each written and joined with a dash where `formatRange` is missing. */
function range(format: Intl.DateTimeFormat, from: Date, to: Date): string {
    return typeof format.formatRange === 'function' ? format.formatRange(from, to) : `${format.format(from)} – ${format.format(to)}`;
}

/** "Fri, Nov 7, 7:30 – 10:00 PM", "Fri 7 Nov – Sun 9 Nov": a span written in one go, in the chat's language. */
function whenText(config: AparteConfig, from: OrderWhen, to?: OrderWhen): string {
    const timed = !from.allDay || (to !== undefined && !to.allDay);
    const format = dateFormat(config, { ...dayOptions(from.date), ...(timed ? TIME : {}) });
    return to && to.date.getTime() !== from.date.getTime() ? range(format, from.date, to.date) : format.format(from.date);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Nights between two days; 0 for a booking that starts and ends on the same one. */
export function nightsOf(from: Date, to: Date): number {
    return Math.max(0, Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000));
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const sr = (ctx: CardContext, key: WordKey) => {
    const node = el('span', { class: 'aparte-sr-only' });
    ctx.word(node, key, P[key]);
    return node;
};

const bound = (ctx: CardContext, tag: 'span' | 'div' | 'dd' | 'dt' | 'strong', className: string, compute: () => string) => {
    const node = el(tag, { class: className });
    ctx.bind(node, compute);
    return node;
};

function kindGlyph(data: Partial<OrderData> | null): HTMLElement {
    return glyph(data?.kind === 'booking' ? CALENDAR : BAG, 'aparte-rich-card__glyph aparte-order__kind');
}

/** The status as a pill: a dot in its tone and its word — the word carries it, not the colour. */
function statusPill(ctx: CardContext, data: OrderData): HTMLElement | null {
    if (!data.status) return null;
    const status = 'status' in data.status ? data.status.status : undefined;
    const pill = el('span', {
        class: `aparte-badge aparte-badge--${status ? INTENT[status] : 'neutral'} aparte-badge--sm aparte-order__status`,
        attrs: { 'data-status': status ?? 'other' },
    }, el('span', { class: 'aparte-order__status-dot', attrs: { 'aria-hidden': 'true' } }));
    pill.append(bound(ctx, 'span', 'aparte-order__status-text', () => statusWord(ctx.config, data)));
    return pill;
}

/** A link out to the order's page, through the kit's action so the app hears of it. */
function viewButton(ctx: CardContext, data: OrderData, primary = false): HTMLButtonElement | null {
    if (!data.url) return null;
    const key: WordKey = data.kind === 'booking' ? 'cardsOrderViewBooking' : 'cardsOrderView';
    const button = ctx.action({ label: say(ctx.config, key), url: data.url, id: 'view', primary }, data, 'aparte-order__view');
    if (button) ctx.word(button, key, P[key]);
    return button;
}

function trackButton(ctx: CardContext, data: OrderData): HTMLButtonElement | null {
    const url = data.delivery?.trackingUrl;
    if (!url) return null;
    const button = ctx.action({ label: say(ctx.config, 'cardsOrderTrack'), url, id: 'track' }, data, 'aparte-order__track');
    if (button) ctx.word(button, 'cardsOrderTrack', P.cardsOrderTrack);
    return button;
}

/** The header every full variant opens with: the kind, the name, when it was placed, the pill. */
function header(ctx: CardContext, data: OrderData): HTMLElement {
    const heading = el('div', { class: 'aparte-order__heading' },
        bound(ctx, 'div', 'aparte-order__title', () => headText(ctx.config, data, true)));
    if (data.date) {
        const date = data.date;
        const time = el('time', { class: 'aparte-order__date', attrs: { datetime: date.toISOString() } });
        ctx.bind(time, () => say(ctx.config, data.kind === 'booking' ? 'cardsOrderBooked' : 'cardsOrderPlaced', { date: placedOn(ctx.config, date) }));
        heading.append(time);
    }
    return el('div', { class: 'aparte-order__head' }, kindGlyph(data), heading, statusPill(ctx, data));
}

/**
 * The line's thumbnail, over a parcel glyph that stays underneath: a missing photo shows
 * the parcel, and one that fails to load is hidden to show it — no node comes or goes.
 */
function thumb(line: OrderLine): HTMLElement {
    const frame = el('div', { class: 'aparte-order__thumb' }, glyph(BOX, 'aparte-rich-card__glyph aparte-order__thumb-glyph'));
    if (!line.image) {
        frame.setAttribute('data-empty', '');
        return frame;
    }
    const image = el('img', {
        class: 'aparte-order__image',
        attrs: { src: line.image.src, alt: line.image.alt ?? line.title, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' },
    });
    image.addEventListener('error', () => {
        image.hidden = true;
        frame.setAttribute('data-empty', '');
    }, { once: true });
    frame.append(image);
    return frame;
}

function lineNode(ctx: CardContext, data: OrderData, line: OrderLine, thumbs: boolean): HTMLElement {
    const meta = el('div', { class: 'aparte-order__line-meta' },
        line.subtitle ? el('span', { class: 'aparte-order__line-variant', text: line.subtitle }) : null,
        line.quantity !== 1 && line.price !== undefined
            ? bound(ctx, 'span', 'aparte-order__line-each', () => say(ctx.config, 'cardsOrderEach', { price: money(ctx.config, data, line.price!) }))
            : null);
    return el('li', { class: 'aparte-order__line' },
        thumbs ? thumb(line) : null,
        el('div', { class: 'aparte-order__line-main' },
            el('div', { class: 'aparte-order__line-title', text: line.title }),
            meta.childNodes.length ? meta : null),
        line.quantity !== 1 ? bound(ctx, 'span', 'aparte-order__qty', () => `×\u2009${formatNumber(ctx.config, line.quantity)}`) : null,
        line.total !== undefined ? bound(ctx, 'span', 'aparte-order__line-total', () => money(ctx.config, data, line.total!)) : null);
}

/** Six lines, then the rest behind "and 4 more" — a `<details>`, so it opens with no script. */
function linesBlock(ctx: CardContext, data: OrderData): HTMLElement | null {
    if (!data.items.length) return null;
    const thumbs = data.items.some((l) => l.image);
    const list = (lines: OrderLine[]) => {
        const ul = el('ul', { class: 'aparte-order__lines', attrs: { role: 'list', 'data-thumbs': thumbs } },
            ...lines.map((line) => lineNode(ctx, data, line, thumbs)));
        ctx.bind(ul, () => say(ctx.config, 'cardsOrderLines'), 'aria-label');
        return ul;
    };
    const block = el('div', { class: 'aparte-order__section aparte-order__items' }, list(data.items.slice(0, LINES_SHOWN)));
    const hidden = data.lineCount - LINES_SHOWN;
    if (hidden > 0) {
        const summary = el('summary', { class: 'aparte-order__more-toggle' },
            glyph(CHEVRON, 'aparte-rich-card__glyph aparte-order__more-chevron'),
            bound(ctx, 'span', 'aparte-order__more-text', () => say(ctx.config, 'cardsOrderMore', { n: formatNumber(ctx.config, hidden) })));
        const more = el('details', { class: 'aparte-order__more' }, summary, list(data.items.slice(LINES_SHOWN)));
        // Past fifty the lines were not kept: say how many, rather than let the list end as if complete.
        const dropped = data.lineCount - data.items.length;
        if (dropped > 0) more.append(bound(ctx, 'div', 'aparte-order__dropped', () => say(ctx.config, 'cardsOrderMore', { n: formatNumber(ctx.config, dropped) })));
        block.append(more);
    }
    return block;
}

function sumRow(ctx: CardContext, key: WordKey, value: () => string, kind: string): HTMLElement {
    return el('div', { class: `aparte-order__sum aparte-order__sum--${kind}` },
        bound(ctx, 'dt', 'aparte-order__sum-label', () => say(ctx.config, key)),
        bound(ctx, 'dd', 'aparte-order__sum-value', value));
}

/**
 * Subtotal, discount, shipping, tax, then the total under a rule. The subtotal shows only
 * when something stands between it and the total — alone it would repeat it.
 */
function totalsBlock(ctx: CardContext, data: OrderData): HTMLElement | null {
    const { config } = ctx;
    const between = data.discount !== undefined || data.shipping !== undefined || data.tax !== undefined;
    const rows = [
        data.subtotal !== undefined && between ? sumRow(ctx, 'cardsOrderSubtotal', () => money(config, data, data.subtotal!), 'subtotal') : null,
        data.discount ? sumRow(ctx, 'cardsOrderDiscount', () => `−${money(config, data, data.discount!)}`, 'discount') : null,
        data.shipping !== undefined
            ? sumRow(ctx, 'cardsOrderShipping', () => (data.shipping === 0 ? say(config, 'cardsOrderFree') : money(config, data, data.shipping!)), data.shipping === 0 ? 'free' : 'shipping')
            : null,
        data.tax !== undefined ? sumRow(ctx, 'cardsOrderTax', () => money(config, data, data.tax!), 'tax') : null,
        data.total !== undefined ? sumRow(ctx, 'cardsOrderTotal', () => money(config, data, data.total!), 'total') : null,
    ].filter(notNull);
    return rows.length ? el('dl', { class: 'aparte-order__section aparte-order__totals' }, ...rows) : null;
}

/** One row of the facts under the totals: a glyph and its label, then the value. */
function infoRow(ctx: CardContext, icon: string, label: () => string, ...value: Array<Node | null>): HTMLElement {
    const dt = el('dt', { class: 'aparte-order__info-label' }, glyph(icon, 'aparte-rich-card__glyph aparte-order__info-glyph'));
    dt.append(bound(ctx, 'span', 'aparte-order__info-label-text', label));
    return el('div', { class: 'aparte-order__info' }, dt, el('dd', { class: 'aparte-order__info-value' }, ...value));
}

function estimateText(config: AparteConfig, estimate: NonNullable<NonNullable<OrderData['delivery']>['estimate']>): string {
    if ('text' in estimate) return estimate.text;
    const format = dateFormat(config, dayOptions(estimate.from.date));
    return estimate.to ? range(format, estimate.from.date, estimate.to.date) : format.format(estimate.from.date);
}

function deliveryRow(ctx: CardContext, data: OrderData): HTMLElement | null {
    const delivery = data.delivery;
    if (!delivery) return null;
    const estimate = delivery.estimate;
    const carrier = [delivery.carrier, delivery.trackingNumber].filter(notNull).join(' · ');
    const text = el('div', { class: 'aparte-order__delivery-text' },
        estimate ? bound(ctx, 'div', 'aparte-order__estimate', () => estimateText(ctx.config, estimate)) : null,
        carrier ? el('div', { class: 'aparte-order__carrier', text: carrier }) : null);
    return infoRow(ctx, TRUCK, () => say(ctx.config, 'cardsOrderDelivery'), text, trackButton(ctx, data));
}

function infoBlock(ctx: CardContext, data: OrderData): HTMLElement | null {
    const text = (value: string, className = '') => el('span', { class: `aparte-order__info-text${className ? ` ${className}` : ''}`, text: value });
    const rows = [
        data.payment ? infoRow(ctx, CARD, () => say(ctx.config, 'cardsOrderPayment'), text(data.payment)) : null,
        deliveryRow(ctx, data),
        data.shippingAddress ? infoRow(ctx, HOUSE, () => say(ctx.config, 'cardsOrderAddress'), text(data.shippingAddress, 'aparte-order__multiline')) : null,
        data.customer ? infoRow(ctx, PERSON, () => say(ctx.config, 'cardsOrderCustomer'), text(data.customer, 'aparte-order__multiline')) : null,
        ...data.facts.map((fact) => infoRow(ctx, INFO, () => fact.label, text(fact.value))),
    ].filter(notNull);
    return rows.length ? el('dl', { class: 'aparte-order__section aparte-order__infos' }, ...rows) : null;
}

/** A day as a calendar leaf: the month over the day's number, the weekday under it. */
function leaf(ctx: CardContext, when: OrderWhen): HTMLElement {
    const node = el('time', { class: 'aparte-order__leaf', attrs: { datetime: when.date.toISOString() } },
        bound(ctx, 'span', 'aparte-order__leaf-month', () => dateFormat(ctx.config, { month: 'short' }).format(when.date)),
        bound(ctx, 'span', 'aparte-order__leaf-day', () => dateFormat(ctx.config, { day: 'numeric' }).format(when.date)),
        bound(ctx, 'span', 'aparte-order__leaf-weekday', () => dateFormat(ctx.config, { weekday: 'short' }).format(when.date)));
    return node;
}

/**
 * The booking's when, where and for how many. One day: its leaf beside the weekday and the
 * hours. Several: two leaves with an arrow and the nights between them — the shape every
 * hotel and rental confirmation takes.
 */
function bookingBlock(ctx: CardContext, data: OrderData): HTMLElement | null {
    const booking = data.booking;
    if (!booking) return null;
    const { config } = ctx;
    const out = el('div', { class: 'aparte-order__section aparte-order__booking' });
    const { start, end } = booking;
    if (start) {
        const multiDay = end !== undefined && nightsOf(start.date, end.date) > 0;
        if (multiDay) {
            const nights = nightsOf(start.date, end.date);
            const side = (when: OrderWhen, key: WordKey) => el('div', { class: 'aparte-order__stay-side' },
                sr(ctx, key),
                leaf(ctx, when),
                when.allDay ? null : bound(ctx, 'span', 'aparte-order__stay-time', () => dateFormat(config, TIME).format(when.date)));
            out.append(el('div', { class: 'aparte-order__stay' },
                side(start, 'cardsOrderStart'),
                el('div', { class: 'aparte-order__stay-span' },
                    glyph(ARROW, 'aparte-rich-card__glyph aparte-order__stay-arrow'),
                    bound(ctx, 'span', 'aparte-order__nights', () => counted(config, 'cardsOrderNight', 'cardsOrderNights', nights))),
                side(end!, 'cardsOrderEnd')));
        } else {
            const hours = start.allDay ? null : bound(ctx, 'span', 'aparte-order__day-hours', () => (end && !end.allDay && end.date > start.date
                ? range(dateFormat(config, TIME), start.date, end.date)
                : dateFormat(config, TIME).format(start.date)));
            out.append(el('div', { class: 'aparte-order__day' },
                leaf(ctx, start),
                el('div', { class: 'aparte-order__day-text' },
                    bound(ctx, 'span', 'aparte-order__day-name', () => {
                        const text = dateFormat(config, { weekday: 'long', day: 'numeric', month: 'long', ...(start.date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }).format(start.date);
                        return text.charAt(0).toLocaleUpperCase(intlTag(config)) + text.slice(1);
                    }),
                    hours)));
        }
    }
    const facts = [
        booking.location ? el('div', { class: 'aparte-order__place' },
            el('dt', { class: 'aparte-order__place-label' }, glyph(PIN, 'aparte-rich-card__glyph aparte-order__info-glyph'), sr(ctx, 'cardsOrderWhere')),
            el('dd', { class: 'aparte-order__place-value', text: booking.location })) : null,
        booking.guests !== undefined ? el('div', { class: 'aparte-order__place' },
            el('dt', { class: 'aparte-order__place-label' }, glyph(PEOPLE, 'aparte-rich-card__glyph aparte-order__info-glyph'), sr(ctx, 'cardsOrderGuestsLabel')),
            bound(ctx, 'dd', 'aparte-order__place-value', () => counted(config, 'cardsOrderGuest', 'cardsOrderGuests', booking.guests!))) : null,
    ].filter(notNull);
    if (facts.length) out.append(el('dl', { class: 'aparte-order__places' }, ...facts));
    return out.childNodes.length ? out : null;
}

/** The whole record: header, booking, lines, totals, the facts, the order's page. */
function receipt(ctx: CardContext, data: OrderData): Node[] {
    const view = viewButton(ctx, data);
    return [
        header(ctx, data),
        bookingBlock(ctx, data),
        linesBlock(ctx, data),
        totalsBlock(ctx, data),
        infoBlock(ctx, data),
        view ? el('div', { class: 'aparte-order__foot' }, view) : null,
    ].filter(notNull);
}

/** "3 items · €129.90", or the booking's when and party: the row's second line. */
function summaryParts(ctx: CardContext, data: OrderData): HTMLElement[] {
    const { config } = ctx;
    const part = (compute: () => string) => bound(ctx, 'span', 'aparte-order__row-part', compute);
    const booking = data.booking;
    return [
        booking?.start ? part(() => whenText(config, booking.start!, booking.end)) : null,
        booking?.guests !== undefined ? part(() => counted(config, 'cardsOrderGuest', 'cardsOrderGuests', booking.guests!)) : null,
        data.itemCount > 0 ? part(() => counted(config, 'cardsOrderItem', 'cardsOrderItems', data.itemCount)) : null,
        data.total !== undefined ? part(() => money(config, data, data.total!)) : null,
    ].filter(notNull);
}

/** One row: the kind, the name over its summary, the pill, and a chevron when it opens a page. */
function compact(ctx: CardContext, data: OrderData): Node[] {
    const title = el('div', { class: 'aparte-order__title' });
    if (data.url) {
        const link = el('a', { class: 'aparte-order__link', attrs: { href: data.url, target: '_blank', rel: 'noopener noreferrer' } });
        ctx.bind(link, () => headText(ctx.config, data, true));
        title.append(link);
    } else {
        ctx.bind(title, () => headText(ctx.config, data, true));
    }
    const parts = summaryParts(ctx, data);
    return [el('div', { class: 'aparte-order__row', attrs: { 'data-linked': data.url !== undefined } },
        kindGlyph(data),
        el('div', { class: 'aparte-order__row-main' }, title, parts.length ? el('div', { class: 'aparte-order__row-meta' }, ...parts) : null),
        statusPill(ctx, data),
        data.url ? glyph(CHEVRON, 'aparte-rich-card__glyph aparte-order__chevron') : null)];
}

function keyFact(ctx: CardContext, key: WordKey | (() => string), value: () => string, kind: string, note?: () => string): HTMLElement {
    const label = typeof key === 'function' ? key : () => say(ctx.config, key);
    return el('div', { class: `aparte-order__keyfact aparte-order__keyfact--${kind}` },
        bound(ctx, 'dt', 'aparte-order__keyfact-label', label),
        el('dd', { class: 'aparte-order__keyfact-value' },
            bound(ctx, 'span', 'aparte-order__keyfact-text', value),
            note ? bound(ctx, 'span', 'aparte-order__keyfact-note', note) : null));
}

/**
 * The moment it is placed: a seal drawn on, the headline, its number, then the two or three
 * facts a person checks before they close the chat — the total, when it arrives or when to
 * be there — and what to do next.
 */
function confirmation(ctx: CardContext, data: OrderData): Node[] {
    const { config } = ctx;
    const status = data.status && 'status' in data.status ? data.status.status : undefined;
    const tone = status ? TONE[status] : 'success';
    const sub = [
        data.title && data.reference ? data.title : null,
        data.reference ? shownReference(data.reference) : data.title ?? null,
    ].filter(notNull);
    const booking = data.booking;
    const estimate = data.delivery?.estimate;
    const facts = [
        data.total !== undefined
            ? keyFact(ctx, 'cardsOrderTotal', () => money(config, data, data.total!), 'total',
                data.itemCount > 0 ? () => counted(config, 'cardsOrderItem', 'cardsOrderItems', data.itemCount) : undefined)
            : null,
        estimate ? keyFact(ctx, 'cardsOrderDelivery', () => estimateText(config, estimate), 'delivery', data.delivery?.carrier ? () => data.delivery!.carrier! : undefined) : null,
        booking?.start
            ? keyFact(ctx, 'cardsOrderWhen', () => whenText(config, booking.start!, booking.end), 'when',
                booking.end && nightsOf(booking.start.date, booking.end.date) > 0
                    ? () => counted(config, 'cardsOrderNight', 'cardsOrderNights', nightsOf(booking.start!.date, booking.end!.date))
                    : undefined)
            : null,
        booking?.location ? keyFact(ctx, 'cardsOrderWhere', () => booking.location!, 'where') : null,
        booking?.guests !== undefined ? keyFact(ctx, 'cardsOrderGuestsLabel', () => counted(config, 'cardsOrderGuest', 'cardsOrderGuests', booking.guests!), 'guests') : null,
        ...data.facts.slice(0, FACTS_IN_CONFIRMATION).map((fact) => keyFact(ctx, () => fact.label, () => fact.value, 'own')),
    ].filter(notNull);
    const buttons = [viewButton(ctx, data, true), trackButton(ctx, data)].filter(notNull);
    const free = data.status && 'text' in data.status ? statusPill(ctx, data) : null;
    return [el('div', { class: 'aparte-order__confirm', attrs: { 'data-tone': tone } },
        glyph(seal(tone), 'aparte-order__seal'),
        bound(ctx, 'div', 'aparte-order__headline', () => headline(config, data)),
        sub.length ? el('div', { class: 'aparte-order__ref', text: sub.join(' · ') }) : null,
        free,
        facts.length ? el('dl', { class: 'aparte-order__keyfacts' }, ...facts) : null,
        buttons.length ? el('div', { class: 'aparte-order__confirm-actions' }, ...buttons) : null)];
}

function render(data: OrderData, ctx: CardContext<OrderVariant>): Node[] {
    if (ctx.variant === 'compact') return compact(ctx, data);
    if (ctx.variant === 'confirmation') return confirmation(ctx, data);
    return receipt(ctx, data);
}

function skeleton(partial: Partial<OrderData> | null, ctx: CardContext<OrderVariant>): Node[] {
    const block = (cls: string, kind: 'text' | 'rect' | 'circle' = 'text') =>
        el('span', { class: `aparte-skeleton aparte-skeleton--${kind} ${cls}`, attrs: { 'aria-hidden': 'true' } });
    // The number the call already names is shown, not shimmered: it is known.
    const name = partial?.reference || partial?.title
        ? bound(ctx, 'div', 'aparte-order__title', () => headText(ctx.config, partial, true))
        : block('aparte-order__sk-title');

    if (ctx.variant === 'compact') {
        return [el('div', { class: 'aparte-order__row' },
            kindGlyph(partial),
            el('div', { class: 'aparte-order__row-main' }, name, block('aparte-order__sk-meta')),
            block('aparte-order__sk-pill', 'rect'))];
    }
    if (ctx.variant === 'confirmation') {
        return [el('div', { class: 'aparte-order__confirm aparte-order__confirm--skeleton' },
            block('aparte-order__sk-seal', 'circle'),
            block('aparte-order__sk-headline'),
            partial?.reference ? el('div', { class: 'aparte-order__ref', text: shownReference(partial.reference) }) : block('aparte-order__sk-ref'),
            el('div', { class: 'aparte-order__keyfacts' }, block('aparte-order__sk-fact', 'rect'), block('aparte-order__sk-fact', 'rect')))];
    }
    const line = () => el('div', { class: 'aparte-order__line aparte-order__line--skeleton' },
        block('aparte-order__sk-thumb', 'rect'),
        el('div', { class: 'aparte-order__line-main' }, block('aparte-order__sk-line'), block('aparte-order__sk-line aparte-order__sk-line--short')),
        block('aparte-order__sk-price'));
    return [
        el('div', { class: 'aparte-order__head' },
            kindGlyph(partial),
            el('div', { class: 'aparte-order__heading' }, name, block('aparte-order__sk-date')),
            block('aparte-order__sk-pill', 'rect')),
        el('div', { class: 'aparte-order__section aparte-order__items' }, el('div', { class: 'aparte-order__lines', attrs: { 'data-thumbs': '' } }, line(), line(), line())),
        el('div', { class: 'aparte-order__section aparte-order__totals' },
            el('div', { class: 'aparte-order__sum' }, block('aparte-order__sk-label'), block('aparte-order__sk-price')),
            el('div', { class: 'aparte-order__sum aparte-order__sum--total' }, block('aparte-order__sk-label'), block('aparte-order__sk-price'))),
    ];
}

/** "Order 1042 — 3 items, total €129.90, shipped": what a model or a text-only reader is told. */
function fallback(data: OrderData, ctx: CardContext<OrderVariant>): string {
    const { config } = ctx;
    const booking = data.booking;
    const status = data.status
        ? ('status' in data.status ? statusWord(config, data).toLocaleLowerCase(intlTag(config)) : data.status.text)
        : undefined;
    const parts = [
        booking?.start ? whenText(config, booking.start, booking.end) : undefined,
        booking?.location,
        booking?.guests !== undefined ? counted(config, 'cardsOrderGuest', 'cardsOrderGuests', booking.guests) : undefined,
        data.itemCount > 0 ? counted(config, 'cardsOrderItem', 'cardsOrderItems', data.itemCount) : undefined,
        data.total !== undefined ? say(config, 'cardsOrderFallbackTotal', { amount: money(config, data, data.total) }) : undefined,
        status,
    ].filter(notNull);
    const head = headText(config, data, false);
    return parts.length ? `${head} — ${parts.join(', ')}` : head;
}

export const orderCard = defineCard<OrderData, OrderVariant>({
    name: 'order',
    variants: ['receipt', 'compact', 'confirmation'],
    styles: orderStyles,
    icon: BAG,
    normalize: readOrder,
    render,
    skeleton,
    label: (data, ctx) => headText(ctx.config, data, false),
    fallback,
    partial: (input) => {
        const reference = str(input['reference'] ?? input['orderNumber'] ?? input['order_number'] ?? input['orderId'] ?? input['order_id']
            ?? input['bookingId'] ?? input['booking_id'] ?? input['confirmation'] ?? input['number'] ?? input['id'])?.replace(/^#\s*/, '');
        const booking = ['bookingId', 'booking_id', 'reservationId', 'reservation_id'].some((k) => input[k] !== undefined) || squeeze(input['kind']) === 'booking';
        if (!reference && !booking) return null;
        return { kind: booking ? 'booking' : 'order', ...(reference ? { reference } : {}) };
    },
});

/** Draw a tool's order or booking as this card — returns the function that stops it. */
export function setupOrderCard(options: CardSetupOptions<OrderData, OrderVariant> = {}): () => void {
    return orderCard.setup(options);
}
