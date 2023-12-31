const nodemailer = require("nodemailer");
const express = require("express");
const Stripe = require("stripe");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

require("dotenv").config();

const router = express.Router();

router.post("/create-checkout-session", async (req, res) => {
  const customer = await stripe.customers.create({
    metadata: {
      userId: req.body.userId,
      cart: JSON.stringify(req.body.cartItems),
    },
  });

  const line_items = req.body.cartItems.map((item) => {
    return {
      price_data: {
        currency: "gbp",
        product_data: {
          name: item.name,
          images: [item.imageUrl],
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    };
  });
  const session = await stripe.checkout.sessions.create({
    shipping_address_collection: {
      allowed_countries: [
        "AR",
        "AU",
        "AT",
        "BE",
        "BO",
        "BR",
        "BG",
        "CA",
        "CL",
        "CO",
        "CR",
        "HR",
        "CY",
        "CZ",
        "DK",
        "DO",
        "EE",
        "FI",
        "FR",
        "DE",
        "GR",
        "HK",
        "HU",
        "IS",
        "IN",
        "ID",
        "IE",
        "IL",
        "IT",
        "JP",
        "LV",
        "LI",
        "LT",
        "LU",
        "MT",
        "MX",
        "NL",
        "NZ",
        "NO",
        "PY",
        "PE",
        "PL",
        "PT",
        "RO",
        "SG",
        "SK",
        "SI",
        "ES",
        "SE",
        "CH",
        "TH",
        "TT",
        "AE",
        "GB",
        "US",
        "UY",
      ],
    },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: 0,
            currency: "gbp",
          },
          display_name: "Free shipping",
          delivery_estimate: {
            minimum: {
              unit: "business_day",
              value: 7,
            },
            maximum: {
              unit: "business_day",
              value: 14,
            },
          },
        },
      },
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: 300,
            currency: "gbp",
          },
          display_name: "Next day air",
          delivery_estimate: {
            minimum: {
              unit: "business_day",
              value: 1,
            },
            maximum: {
              unit: "business_day",
              value: 1,
            },
          },
        },
      },
    ],
    phone_number_collection: {
      enabled: true,
    },
    customer: customer.id,
    line_items,
    mode: "payment",
    success_url: `${process.env.CLIENT_URL}/checkout-success`,
    cancel_url: `${process.env.CLIENT_URL}/cart`,
  });

  res.send({ url: session.url });
});

// Create Order

// This is your Stripe CLI webhook secret for testing your endpoint locally.
let endpointSecret;

// endpointSecret =
//   "whsec_dc040ed4c848ecd20204841c08fe665803989ca2287ab5465f2174c578251d05";

router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (request, response) => {
    const sig = request.headers["stripe-signature"];

    let data;
    let eventType;

    if (endpointSecret) {
      let event;

      try {
        event = stripe.webhooks.constructEvent(
          request.body,
          sig,
          endpointSecret
        );
        console.log("Webhook Verified");
      } catch (err) {
        console.log(`Webhook Error: ${err.message}`);
        response.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }
      data = event.data.object;
      eventType = event.type;
    } else {
      data = request.body.data.object;
      eventType = request.body.type;
    }

    // Handle the event

    if (eventType === "checkout.session.completed") {
      stripe.customers
        .retrieve(data.customer)
        .then((customer) => {
          const createOrder = (customer, data) => {
            const Items = JSON.parse(customer.metadata.cart);

            const productDetails = Items.map((product) => {
              return `
                Product: ${product.name}
                Image URL: ${product.imageUrl}
                Price: ${product.price} Euros
                Quantity: ${product.quantity}
              `;
            });

            const formattedProductDetails = productDetails.join("\n");

            const savedOrder = {
              name: data.customer_details.name,
              order_id: data.payment_intent,
              amount: data.amount_total / 100,
              paymentMethod: "CARD",
              items: `${formattedProductDetails}`,
            };

            try {
              console.log(savedOrder);

              const emailMessage = `
                Dear ${savedOrder.name},
                Thank you for your payment! We are pleased to inform you that your order has been successfully processed and confirmed.
                Order Details:  
                Order ID: ${savedOrder.order_id} 
                Payment Amount: ${savedOrder.amount}
                Payment Method: ${savedOrder.paymentMethod}}
                Items: ${savedOrder.items}

            Your goods will be prepared and dispatched within the next 2 business days. We estimate that the delivery will take place within 14 days maximum.
            If you have any questions or concerns regarding your order, please feel free to contact our customer support team.
            Thank you once again for choosing our store. We look forward to serving you!

            Best regards,
            Apekkystoreteam.`;

              const sellerEmailMessage = `
                Dear Mrs Apeke,

We are writing to inform you that a payment has been received for Order {{orderID}}. Please review the details below:

Order Details:

Order ID: ${savedOrder.order_id}
Payment Amount: ${savedOrder.amount}
Payment Method: ${savedOrder.paymentMethod}
Customer Name: ${savedOrder.name}
Customer Email: ${data.customer_details.email}
Items: ${savedOrder.items}
address: ${data.customer_details.address.line1}
deliverytime: ${
                data.shipping_options[0].shipping_amount === 0
                  ? "Next Working day"
                  : "Between 14 days"
              }
country: {{country}}
city: {{city}}

Please proceed with the necessary steps to fulfill the order and prepare it for shipment. Contact the buyer, ${
                savedOrder.name
              }, at ${
                data.customer_details.email
              } if you require any additional information or have any questions regarding their order.

Thank you for your prompt attention to this matter. We appreciate your commitment to providing exceptional service to our valued customers.

Best regards,

Apekky Store Team.
                `;

              const transporter = nodemailer.createTransport({
                host: "smtp-relay.brevo.com",
                port: 587,
                auth: {
                  user: "apekkybeautycare@gmail.com",
                  pass: process.env.GOOGLE_PASS,
                },
              });

              const mailOptions = {
                from: "apekkybeautycare@gmail.com",
                to: data.customer_details.email,
                subject: "PAYMENT SUCCESSFUL",
                text: emailMessage,
              };

              const sellerMailOptions = {
                from: "apekkybeautycare@gmail.com",
                to: "beautysmith477@gmail.com",
                subject: "PAYMENT SUCCESSFUL",
                text: sellerEmailMessage,
              };

              transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  console.error("Error sending email:", error);
                } else {
                  console.log("Email sent:", info.response);
                }
              });

              transporter.sendMail(sellerMailOptions, (error, info) => {
                if (error) {
                  console.error("Error sending email:", error);
                } else {
                  console.log("Email sent:", info.response);
                }
              });
            } catch (err) {
              console.log(err.message);
            }
          };
          createOrder(customer, data);
          console.log(customer);
          console.log("data:", data);
        })
        .catch((err) => console.log(err.message));
    }

    // Return a 200 response to acknowledge receipt of the event
    response.send().end();
  }
);

module.exports = router;
