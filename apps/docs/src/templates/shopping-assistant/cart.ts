/**
 * The cart: the count on the header's button, the popover that lists it, and the toast that
 * says something was added. It is the page's, not the chat's: a product card's "Add to cart"
 * and a storefront tile's button both land here (app.ts), and the assistant knows nothing of it.
 *
 * In a real shop `add` posts to your cart API; the rest stays.
 */
import { findItem } from './catalog';

export interface Cart {
    /** Add one of a product, by its catalogue id; returns its name, or `null` for an unknown id. */
    add(id: string): string | null;
    /** Say something in the toast, for a moment. */
    toast(text: string, withCartButton?: boolean): void;
}

const euros = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' });

export function createCart(root: HTMLElement, initial: Record<string, number> = {}): Cart {
    const lines = new Map<string, number>(Object.entries(initial));
    const button = root.querySelector<HTMLButtonElement>('[data-sa-cart-button]')!;
    const count = root.querySelector<HTMLElement>('[data-sa-cart-count]')!;
    const popover = root.querySelector<HTMLElement>('#sa-cart')!;
    const list = popover.querySelector<HTMLElement>('[data-sa-cart-lines]')!;
    const total = popover.querySelector<HTMLElement>('[data-sa-cart-total]')!;
    const empty = popover.querySelector<HTMLElement>('[data-sa-cart-empty]')!;
    const toastBox = root.querySelector<HTMLElement>('[data-sa-toast]')!;
    const toastText = toastBox.querySelector<HTMLElement>('[data-sa-toast-text]')!;
    const toastView = toastBox.querySelector<HTMLButtonElement>('[data-sa-toast-view]')!;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;

    /** Draw the count and the list. Text only: a product's name never goes through `innerHTML`. */
    function draw(): void {
        const items = [...lines].reduce((sum, [, quantity]) => sum + quantity, 0);
        count.textContent = String(items);
        count.hidden = items === 0;
        button.setAttribute('aria-label', items === 1 ? 'Cart, 1 item' : `Cart, ${items} items`);

        const rows: HTMLElement[] = [];
        let sum = 0;
        for (const [id, quantity] of lines) {
            const item = findItem(id);
            if (!item) continue;
            sum += item.price * quantity;
            const row = document.createElement('li');
            row.className = 'sa-cart__line';
            const photo = document.createElement('img');
            photo.className = 'sa-cart__photo';
            photo.src = item.photo;
            photo.alt = '';
            const name = document.createElement('span');
            name.className = 'sa-cart__name';
            name.textContent = quantity > 1 ? `${item.name} × ${quantity}` : item.name;
            const price = document.createElement('span');
            price.className = 'sa-cart__price';
            price.textContent = euros.format(item.price * quantity);
            row.append(photo, name, price);
            rows.push(row);
        }
        list.replaceChildren(...rows);
        total.textContent = euros.format(sum);
        empty.hidden = rows.length > 0;
        popover.toggleAttribute('data-empty', rows.length === 0);
    }

    // The toast is a status region that stays in the page, so what it says is announced; closed,
    // it is only out of sight, and its button out of the tab order.
    function closeToast(): void {
        delete toastBox.dataset['open'];
        toastView.hidden = true;
    }

    function toast(text: string, withCartButton = false): void {
        toastText.textContent = text;
        toastView.hidden = !withCartButton;
        toastBox.dataset['open'] = '';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(closeToast, 3600);
    }

    toastView.addEventListener('click', () => {
        closeToast();
        popover.showPopover();
    });

    // A popover opens in the top layer, centred: it is placed under the cart's button as it opens.
    popover.addEventListener('beforetoggle', (event) => {
        if ((event as ToggleEvent).newState !== 'open') return;
        const anchor = button.getBoundingClientRect();
        popover.style.insetBlockStart = `${anchor.bottom + 8}px`;
        popover.style.insetInlineEnd = `${Math.max(8, document.documentElement.clientWidth - anchor.right)}px`;
    });

    draw();
    return {
        add(id) {
            const item = findItem(id);
            if (!item) return null;
            lines.set(item.id, (lines.get(item.id) ?? 0) + 1);
            draw();
            // The count says it changed, once: the class is taken off and put back to replay it.
            count.classList.remove('sa-bump');
            void count.offsetWidth;
            count.classList.add('sa-bump');
            toast(`${item.name} added to your cart`, true);
            return item.name;
        },
        toast,
    };
}
