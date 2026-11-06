/// <reference types="@tarojs/taro" />

declare module "*.png";
declare module "*.css";

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production";
    /** the platform being built: weapp (WeChat), tt (Douyin) or h5 */
    TARO_ENV: "weapp" | "tt" | "h5" | "swan" | "alipay" | "qq" | "jd" | "rn" | "harmony";
  }
}
