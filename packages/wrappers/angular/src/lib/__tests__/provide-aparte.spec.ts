import { describe, it, expect, vi, afterEach } from 'vitest';
import '@angular/compiler';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAparte } from '../provide-aparte';
import { AparteAiService } from '../aparte-ai.service';

describe('provideAparte', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('auto-connects the AparteAiService client on app init', async () => {
        const connect = vi.spyOn(AparteAiService.prototype, 'connect');
        TestBed.configureTestingModule({ providers: [provideAparte({})] });
        // TestBed runs app initializers when the testing module is created;
        // donePromise settles once the (async) aparté initializer finished.
        await TestBed.inject(ApplicationInitStatus).donePromise;
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('skips the client start with autoConnect: false', async () => {
        const connect = vi.spyOn(AparteAiService.prototype, 'connect');
        TestBed.configureTestingModule({ providers: [provideAparte({ autoConnect: false })] });
        await TestBed.inject(ApplicationInitStatus).donePromise;
        expect(connect).not.toHaveBeenCalled();
    });
});
