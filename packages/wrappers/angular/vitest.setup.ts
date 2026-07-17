// Zone.js first: the components use Angular's default (zone-based) change
// detection, so the test platform needs it (NG0908) — it must load before
// `@angular/core/testing`.
import 'zone.js';
import 'zone.js/testing';
// The JIT compiler must be loaded BEFORE initTestEnvironment: the specs mount
// standalone components compiled in Ivy *partial* mode, which fall back to JIT here.
import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { TestBed } from '@angular/core/testing';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
