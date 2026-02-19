import axios from "axios";
export const getRandomPost = async (subreddit) => {
  const res = await axios.get(
    `https://www.reddit.com/r/${subreddit}/random.json`,
    {
      headers: {
        "sec-fetch-user": "?1",
        "sec-fetch-site": "none",
        "sec-ch-ua-mobile": "?1",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "upgrade-insecure-requests": "1",
        "sec-ch-ua-platform": '"Android"',
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua":
          '"Not A(Brand";v="99", "Opera GX";v="107", "Chromium";v="121"',
        cookie:
          "rdt=0c689ec2fff32dbec6962352e676b4ad; " +
          "edgebucket=VOWGMAbaJES1bHS7La; " +
          "csv=2; " +
          'g_state={"i_l":0}; ' +
          "reddit_session=1642635253402%2C2024-01-05T18%3A16%3A19%2Ccd593c271cfc3a35537b680ca7092d6bce9f13d7; " +
          "loid=0000000000kym6m9ay.2.1647858939259.Z0FBQUFBQmxtRWQ0YlBhc0FxUC1GbmVtMmtBWGFXZ0ZjZkJXN1lRbEZNVlZCMEZSM1ZWOGhfRmdxVFhkcTNIZkUxZXRyaDBTSTNZQUw0cjRESUs1cjBvWXRIR0g0YS1sQ3NXb0YxUERSMndqVHcyWnhNQUJfNkRPY0o4VkRkUFVlNExiSG1nYzJZYVk; " +
          "theme=1; " +
          "recent_srs=t5_2sc2h%2Ct5_2usfk%2Ct5_2r7yd%2Ct5_2v6gg%2C; " +
          "session=4ac55e8d61922166f3d0c12330f9d54a598c013dgAWVSQAAAAAAAABKZwHWZUdB2W3+8SSdzH2UjAdfY3NyZnRflIwoZWZkNDAwNTM1OWY2YmQwN2IwNzJhOWNjYjg5NmQ4NmU2ZWQ0Mzc1ZpRzh5Qu; " +
          "Puzzleheaded_Bed5988_recentclicks2=t3_a4b5dn%2Ct3_6l6tz0%2Ct3_10uak5k%2Ct3_gsaqkb%2Ct3_kyc274; " +
          "token_v2=eyJhbGciOiJSUzI1NiIsImtpZCI6IlNIQTI1NjpzS3dsMnlsV0VtMjVmcXhwTU40cWY4MXE2OWFFdWFyMnpLMUdhVGxjdWNZIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ1c2VyIiwiZXhwIjoxNzEwNzQyMjc0LjEzOTY5OCwiaWF0IjoxNzEwNjU1ODc0LjEzOTY5NywianRpIjoiNTNDSVVLN1hkTkNTT3VLcmY2d05na1o2TG0xTkhRIiwiY2lkIjoiMFItV0FNaHVvby1NeVEiLCJsaWQiOiJ0Ml9reW02bTlheSIsImFpZCI6InQyX2t5bTZtOWF5IiwibGNhIjoxNjQ3ODU4OTM5MjU5LCJzY3AiOiJlSnhra2RHT3REQUloZC1sMXo3Ql95cF9OaHRzY1lhc0xRYW9rM243RFZvY2s3MDdjTDRpSFA4bktJcUZMRTJ1QktHa0tXRUZXdE9VTmlMdjU4eTlPWkVGU3lGVFI4NDN5d29rYVVwUFVtTjVweWxSd1daa0xsZmFzVUtEQjZZcFZTNloyMEtQUzV2UTNJMUZ6MDZNcWx4V0h0VFlvM0pwYkdNSzJ4UGp6Y1pxUXlxdXk2bE1ZRmtvbjhXTGZ2eUctdFktZjdiZmhIWXdyS2dLRF9UT3VGeHdZX0hERkhiX25wcjBiRjJ3cUwzWGc5US0xLU4yN2JObW9kbTVfVnpQdnphU2NUbUc1aWZZdjd0LUNSMTQ1SG1aVVFjd1lnMF95ckFqNl9Ddk9vREtCUVdNSlloUEk1QXJsMl9fSmRpdVRmOGF0eWQtLUdiRVRXXzRyUm1vNXhMRW9VX2o2emNBQVBfX1hEX2U0dyIsInJjaWQiOiJlOWktRHpLaHVodnJpWUthSFF2dFlvUkp2SDZBcTFRZXhOWjI5bjRrWG9BIiwiZmxvIjoyfQ.LyWogCxlWYeN62yAWdWkQu2trkQopEjS75eU346AvAl0bczWf5hX3a_8xmDuuqK8z4BcWtUjRXMcWy1RIXF6Txt5Ha_VGTzIrOLpiDzEySGBHr4FSEwE_DJoG9VX9pfXJQhqNZBcdkMYYMA-HTwi1c7hGu7eGY7SzVPjcdWpfTO6o1X_ooGErxh0Z0uxYWl0H7FOAIalMD6JbFUXPQ6eBkb2UFiuXf7LgvaU-uk7og4HPJlN594ufCu-U9QulGla_Gfsu-hyr2x-YykvTMrDuLM3rjsvIy3OEtByfC98Vcp3MELzlsXkg_DvnQ1PJPVUe1oDM5QlyABh0tkiu-FVCA; " +
          "t2_kym6m9ay_recentclicks3=t3_ywwqrq%2Ct3_111l2nv%2Ct3_9vplgj%2Ct3_tvnw7w%2Ct3_zmu5qg%2Ct3_k8h6l3%2Ct3_1b5bsev%2Ct3_102d0a7%2Ct3_10umydp%2Ct3_a4b5dn; " +
          "csrf_token=85427a184e25a79c3ecdb1c62284e446; " +
          "session_tracker=pgomfbcaelegqkfjcj.0.1710693747064.Z0FBQUFBQmw5eDF6MzZNNUJ6NF9pX0pRaUxBT2daMkhZMG85dTRxcmVnbnVfTU5WaGpfVUhoTlFMb1pNYnk3bGtETFktMzFBSnhrMFp3ZGxjZlZJUDhVaUc1V2NuV190ZjdYa1Vvam1TMFlzUk9OZ2k5RWZHSGlSaXBtd3NzMHJHbklzQzJCUTVvX04",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      },
    },
  );
  return {
    image: res.data[0].data.children[0].data.url,
    title: res.data[0].data.children[0].data.title,
  };
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
