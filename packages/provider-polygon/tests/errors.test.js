/**
 * Tests for Polygon.io error classes.
 *
 * These tests verify that custom error types (RateLimitError, ApiError,
 * ParseError) are correctly constructed and can be identified via type guards.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RateLimitError,
  ApiError,
  ParseError,
  isRateLimitError,
  isApiError,
  isParseError,
} from "../dist/src/errors.js";

describe("RateLimitError - Construction", () => {
  it("should create RateLimitError with full data", () => {
    const error = new RateLimitError({
      retryAfter: 60,
      limitType: "requests_per_minute",
      requestUrl: "https://api.polygon.io/v2/aggs/ticker/ES/range/5/minute/...",
    });

    assert.ok(error instanceof RateLimitError, "Should be instance of RateLimitError");
    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.equal(error.name, "RateLimitError", "Name should be RateLimitError");
    assert.ok(
      error.message.includes("rate limit"),
      "Message should mention rate limit"
    );
    assert.equal(error.data.retryAfter, 60, "Should have retryAfter in data");
    assert.equal(
      error.data.limitType,
      "requests_per_minute",
      "Should have limitType in data"
    );
    assert.equal(
      error.data.requestUrl,
      "https://api.polygon.io/v2/aggs/ticker/ES/range/5/minute/...",
      "Should have requestUrl in data"
    );
    assert.equal(error.data.provider, "polygon", "Should have provider in data");
  });

  it("should create RateLimitError with minimal data", () => {
    const error = new RateLimitError({});

    assert.ok(error instanceof RateLimitError, "Should be instance of RateLimitError");
    assert.equal(error.data.provider, "polygon", "Should have provider in data");
  });

  it("should create RateLimitError with custom fields", () => {
    const error = new RateLimitError({
      retryAfter: 120,
      customField: "custom value",
    });

    assert.equal(error.data.retryAfter, 120, "Should have retryAfter");
    assert.equal(error.data.customField, "custom value", "Should preserve custom fields");
  });
});

describe("ApiError - Construction", () => {
  it("should create ApiError with full data", () => {
    const error = new ApiError("Unauthorized", {
      statusCode: 401,
      statusText: "Unauthorized",
      requestUrl: "https://api.polygon.io/v2/aggs/ticker/ES/...",
      responseBody: '{"error": "Invalid API key"}',
    });

    assert.ok(error instanceof ApiError, "Should be instance of ApiError");
    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.equal(error.name, "ApiError", "Name should be ApiError");
    assert.equal(error.message, "Unauthorized", "Message should match provided message");
    assert.equal(error.statusCode, 401, "Should have statusCode property");
    assert.equal(error.statusText, "Unauthorized", "Should have statusText property");
    assert.equal(error.data.statusCode, 401, "Should have statusCode in data");
    assert.equal(error.data.statusText, "Unauthorized", "Should have statusText in data");
    assert.equal(
      error.data.requestUrl,
      "https://api.polygon.io/v2/aggs/ticker/ES/...",
      "Should have requestUrl in data"
    );
    assert.equal(
      error.data.responseBody,
      '{"error": "Invalid API key"}',
      "Should have responseBody in data"
    );
  });

  it("should create ApiError with minimal data", () => {
    const error = new ApiError("Something went wrong", {});

    assert.ok(error instanceof ApiError, "Should be instance of ApiError");
    assert.equal(error.message, "Something went wrong", "Should have correct message");
    assert.equal(error.statusCode, undefined, "statusCode should be undefined");
    assert.equal(error.statusText, undefined, "statusText should be undefined");
  });

  it("should create ApiError for 500 server error", () => {
    const error = new ApiError("Internal Server Error", {
      statusCode: 500,
      statusText: "Internal Server Error",
      requestUrl: "https://api.polygon.io/v2/aggs/ticker/SPY/...",
      responseBody: '{"error": "Database connection failed"}',
    });

    assert.equal(error.statusCode, 500, "Should have 500 status code");
    assert.ok(
      error.message.includes("Internal Server Error"),
      "Message should mention server error"
    );
  });

  it("should create ApiError for 404 not found", () => {
    const error = new ApiError("Not Found", {
      statusCode: 404,
      statusText: "Not Found",
      requestUrl: "https://api.polygon.io/v2/aggs/ticker/INVALID/...",
    });

    assert.equal(error.statusCode, 404, "Should have 404 status code");
    assert.equal(error.message, "Not Found", "Should have correct message");
  });
});

describe("ParseError - Construction", () => {
  it("should create ParseError with full data", () => {
    const error = new ParseError("Missing required field: results", {
      responseBody: '{"status": "OK", "ticker": "ES"}',
      field: "results",
      expectedType: "array",
      actualType: "undefined",
    });

    assert.ok(error instanceof ParseError, "Should be instance of ParseError");
    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.equal(error.name, "ParseError", "Name should be ParseError");
    assert.ok(
      error.message.includes("Missing required field"),
      "Message should describe error"
    );
    assert.equal(
      error.data.responseBody,
      '{"status": "OK", "ticker": "ES"}',
      "Should have responseBody in data"
    );
    assert.equal(error.data.field, "results", "Should have field in data");
    assert.equal(error.data.expectedType, "array", "Should have expectedType in data");
    assert.equal(error.data.actualType, "undefined", "Should have actualType in data");
  });

  it("should create ParseError with minimal data", () => {
    const error = new ParseError("Malformed JSON");

    assert.ok(error instanceof ParseError, "Should be instance of ParseError");
    assert.equal(error.message, "Malformed JSON", "Should have correct message");
    assert.ok(error.data, "Should have data object");
  });

  it("should create ParseError without data", () => {
    const error = new ParseError("Invalid response format");

    assert.ok(error instanceof ParseError, "Should be instance of ParseError");
    assert.equal(error.message, "Invalid response format", "Should have correct message");
  });

  it("should create ParseError for OHLC validation", () => {
    const error = new ParseError("High price must be >= low price", {
      aggregate: '{"t": 1727787000000, "o": 4500, "h": 4499, "l": 4500, "c": 4500, "v": 1000}',
      field: "h,l",
      high: 4499,
      low: 4500,
    });

    assert.ok(error.message.includes("High price"), "Message should describe OHLC error");
    assert.equal(error.data.high, 4499, "Should have high in data");
    assert.equal(error.data.low, 4500, "Should have low in data");
  });
});

describe("isRateLimitError - Type Guard", () => {
  it("should return true for RateLimitError", () => {
    const error = new RateLimitError({ retryAfter: 60 });
    assert.equal(isRateLimitError(error), true, "Should identify RateLimitError");
  });

  it("should return false for ApiError", () => {
    const error = new ApiError("Unauthorized", { statusCode: 401 });
    assert.equal(isRateLimitError(error), false, "Should not identify ApiError as RateLimitError");
  });

  it("should return false for ParseError", () => {
    const error = new ParseError("Malformed JSON");
    assert.equal(isRateLimitError(error), false, "Should not identify ParseError as RateLimitError");
  });

  it("should return false for standard Error", () => {
    const error = new Error("Generic error");
    assert.equal(isRateLimitError(error), false, "Should not identify Error as RateLimitError");
  });

  it("should return false for non-error values", () => {
    assert.equal(isRateLimitError(null), false, "Should return false for null");
    assert.equal(isRateLimitError(undefined), false, "Should return false for undefined");
    assert.equal(isRateLimitError("error"), false, "Should return false for string");
    assert.equal(isRateLimitError(123), false, "Should return false for number");
    assert.equal(isRateLimitError({}), false, "Should return false for plain object");
  });
});

describe("isApiError - Type Guard", () => {
  it("should return true for ApiError", () => {
    const error = new ApiError("Unauthorized", { statusCode: 401 });
    assert.equal(isApiError(error), true, "Should identify ApiError");
  });

  it("should return false for RateLimitError", () => {
    const error = new RateLimitError({ retryAfter: 60 });
    assert.equal(isApiError(error), false, "Should not identify RateLimitError as ApiError");
  });

  it("should return false for ParseError", () => {
    const error = new ParseError("Malformed JSON");
    assert.equal(isApiError(error), false, "Should not identify ParseError as ApiError");
  });

  it("should return false for standard Error", () => {
    const error = new Error("Generic error");
    assert.equal(isApiError(error), false, "Should not identify Error as ApiError");
  });

  it("should return false for non-error values", () => {
    assert.equal(isApiError(null), false, "Should return false for null");
    assert.equal(isApiError(undefined), false, "Should return false for undefined");
    assert.equal(isApiError("error"), false, "Should return false for string");
    assert.equal(isApiError(123), false, "Should return false for number");
    assert.equal(isApiError({}), false, "Should return false for plain object");
  });
});

describe("isParseError - Type Guard", () => {
  it("should return true for ParseError", () => {
    const error = new ParseError("Malformed JSON");
    assert.equal(isParseError(error), true, "Should identify ParseError");
  });

  it("should return false for RateLimitError", () => {
    const error = new RateLimitError({ retryAfter: 60 });
    assert.equal(isParseError(error), false, "Should not identify RateLimitError as ParseError");
  });

  it("should return false for ApiError", () => {
    const error = new ApiError("Unauthorized", { statusCode: 401 });
    assert.equal(isParseError(error), false, "Should not identify ApiError as ParseError");
  });

  it("should return false for standard Error", () => {
    const error = new Error("Generic error");
    assert.equal(isParseError(error), false, "Should not identify Error as ParseError");
  });

  it("should return false for non-error values", () => {
    assert.equal(isParseError(null), false, "Should return false for null");
    assert.equal(isParseError(undefined), false, "Should return false for undefined");
    assert.equal(isParseError("error"), false, "Should return false for string");
    assert.equal(isParseError(123), false, "Should return false for number");
    assert.equal(isParseError({}), false, "Should return false for plain object");
  });
});

describe("Error Inheritance", () => {
  it("should have proper error inheritance for RateLimitError", () => {
    const error = new RateLimitError({ retryAfter: 60 });

    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.ok(error instanceof RateLimitError, "Should be instance of RateLimitError");
    assert.equal(error.constructor.name, "RateLimitError", "Constructor name should be correct");
  });

  it("should have proper error inheritance for ApiError", () => {
    const error = new ApiError("Error message", { statusCode: 400 });

    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.ok(error instanceof ApiError, "Should be instance of ApiError");
    assert.equal(error.constructor.name, "ApiError", "Constructor name should be correct");
  });

  it("should have proper error inheritance for ParseError", () => {
    const error = new ParseError("Parse error");

    assert.ok(error instanceof Error, "Should be instance of Error");
    assert.ok(error instanceof ParseError, "Should be instance of ParseError");
    assert.equal(error.constructor.name, "ParseError", "Constructor name should be correct");
  });
});

describe("Error Stack Traces", () => {
  it("should have stack trace for RateLimitError", () => {
    const error = new RateLimitError({ retryAfter: 60 });
    assert.ok(error.stack, "Should have stack trace");
    assert.ok(error.stack.includes("RateLimitError"), "Stack should include error name");
  });

  it("should have stack trace for ApiError", () => {
    const error = new ApiError("API error", { statusCode: 500 });
    assert.ok(error.stack, "Should have stack trace");
    assert.ok(error.stack.includes("ApiError"), "Stack should include error name");
  });

  it("should have stack trace for ParseError", () => {
    const error = new ParseError("Parse error");
    assert.ok(error.stack, "Should have stack trace");
    assert.ok(error.stack.includes("ParseError"), "Stack should include error name");
  });
});

describe("Error Use Cases", () => {
  it("should support try-catch with type guards", () => {
    try {
      throw new RateLimitError({ retryAfter: 60 });
    } catch (err) {
      if (isRateLimitError(err)) {
        assert.equal(err.data.retryAfter, 60, "Should access retryAfter via type guard");
      } else {
        assert.fail("Should have caught RateLimitError");
      }
    }
  });

  it("should support error handling pattern", () => {
    const handleError = (error) => {
      if (isRateLimitError(error)) {
        return `Retry after ${error.data.retryAfter} seconds`;
      } else if (isApiError(error)) {
        return `API error: ${error.statusCode} - ${error.message}`;
      } else if (isParseError(error)) {
        return `Parse error: ${error.message}`;
      } else {
        return `Unknown error: ${error.message}`;
      }
    };

    const rateLimitError = new RateLimitError({ retryAfter: 60 });
    assert.equal(
      handleError(rateLimitError),
      "Retry after 60 seconds",
      "Should handle RateLimitError"
    );

    const apiError = new ApiError("Unauthorized", { statusCode: 401 });
    assert.equal(
      handleError(apiError),
      "API error: 401 - Unauthorized",
      "Should handle ApiError"
    );

    const parseError = new ParseError("Malformed JSON");
    assert.equal(
      handleError(parseError),
      "Parse error: Malformed JSON",
      "Should handle ParseError"
    );

    const genericError = new Error("Generic error");
    assert.equal(
      handleError(genericError),
      "Unknown error: Generic error",
      "Should handle generic Error"
    );
  });
});